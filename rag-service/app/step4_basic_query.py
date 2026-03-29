"""
============================================================
Step 4: Query Pipeline
============================================================
Builds retrievers from all 3 collections (text, image, table),
performs query fusion, optional reranking, and LLM answer generation.

All vector operations are filtered by ``kb_id`` via MetadataFilter.
Credentials are passed as function parameters.
============================================================
"""

from __future__ import annotations

import logging
import time
import copy
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Iterable

from llama_index.core import VectorStoreIndex
from llama_index.core.schema import QueryBundle
from llama_index.core.vector_stores.types import MetadataFilter, MetadataFilters

from app.config import (
    PGVECTOR_IMAGE_TABLE,
    PGVECTOR_TABLE_TABLE,
    PGVECTOR_TEXT_TABLE,
    TEXT_SIMILARITY_TOP_K,
    IMAGE_SIMILARITY_TOP_K,
    TABLE_SIMILARITY_TOP_K,
    TEXT_RETRIEVAL_SCORE_THRESHOLD,
    IMAGE_RETRIEVAL_SCORE_THRESHOLD,
    TABLE_RETRIEVAL_SCORE_THRESHOLD,
    TEXT_RETRIEVAL_SCORE_MARGIN,
    IMAGE_RETRIEVAL_SCORE_MARGIN,
    TABLE_RETRIEVAL_SCORE_MARGIN,
    RERANK_TIMEOUT_SECONDS,
    RETRIEVAL_RETRIES,
    RETRIEVAL_RETRY_DELAY_SECONDS,
    ANSWER_ASSET_TOP_K,
    ANSWER_ASSET_SCORE_THRESHOLD,
    TEXT_CONTEXT_TOP_K,
    IMAGE_CONTEXT_TOP_K,
    TABLE_CONTEXT_TOP_K,
    TEXT_CONTEXT_CHAR_LIMIT,
    IMAGE_SUMMARY_CHAR_LIMIT,
    TABLE_SUMMARY_CHAR_LIMIT,
    TABLE_PREVIEW_ROW_LIMIT,
    TABLE_PREVIEW_ROW_CHAR_LIMIT,
    RERANK_CONFIDENCE_FLOOR,
    QUERY_EXPANSION_SCORE_PENALTY,
    RERANKED_BRANCH_KEYS,
    WEB_ANSWER_ENABLE_THINKING,
    RequestCredentials,
)
from app.model_provider_utils import create_embedding_model, create_text_llm
from app.reranker import Reranker, rerank_retrieval_bundle
from app.vector_store_management import create_pgvector_store

LOGGER = logging.getLogger(__name__)

_EMBEDDING_CACHE_MAX = 128
IMAGE_REF_PATTERN = re.compile(r"(img(?:_p\d{2,4})?_\d+)", re.IGNORECASE)
NUMBER_PATTERN = re.compile(r"\d+")
ASCII_TERM_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9._/-]*")
CJK_PATTERN = re.compile(r"[\u3400-\u9fff]")

QUERY_TERM_EXPANSIONS: dict[str, tuple[str, ...]] = {
    "MRB": ("Material Review Board",),
    "QSAT": ("Quality Sensitivity Alert Tag",),
    "8D": ("8D report", "8 disciplines"),
    "CAR": ("Corrective Action Request",),
}

QUERY_PHRASE_EXPANSIONS: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (("trigger criteria", "trigger conditions"), ("trigger criteria", "when to initiate")),
    (("flowchart", "flow diagram"), ("flowchart", "process flow")),
    (("flow",), ("flow", "process")),
    (("critical defect",), ("critical defect", "key defect", "non-conformance")),
    (("defect handling",), ("defect handling", "non-conformance handling")),
    (("customer complaint",), ("customer complaint",)),
    (("quality alert",), ("quality alert", "quality sensitivity alert")),
)


# ============================================================
# Helper functions (ported from web_app.py)
# ============================================================

def _safe_score(node: Any) -> float:
    return float(getattr(node, "score", 0.0) or 0.0)


def _contains_cjk(text: str) -> bool:
    return bool(CJK_PATTERN.search(text or ""))


def _append_unique_terms(terms: list[str], values: Iterable[str]) -> None:
    seen = {term.casefold() for term in terms}
    for value in values:
        normalized = str(value).strip()
        if not normalized:
            continue
        folded = normalized.casefold()
        if folded in seen:
            continue
        terms.append(normalized)
        seen.add(folded)


def _dedupe_nodes(nodes: Iterable[Any]) -> list[Any]:
    deduped: list[Any] = []
    seen: set[tuple[str, str, str, Any]] = set()
    for node in nodes:
        metadata = getattr(node, "metadata", {}) or {}
        key = (
            metadata.get("type", ""),
            metadata.get("image_id", ""),
            metadata.get("table_id", ""),
            metadata.get("block_id", ""),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(node)
    return deduped


def _extract_image_ref_id(value: str) -> str:
    match = IMAGE_REF_PATTERN.search(value or "")
    return match.group(1) if match else ""


def _truncate_for_prompt(text: str, limit: int) -> str:
    normalized = (text or "").strip()
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: max(0, limit - 1)].rstrip()}..."


def _extract_table_embedded_image_ids(node: Any) -> set[str]:
    metadata = getattr(node, "metadata", {}) or {}
    raw_table = str(metadata.get("raw_table", "") or "")
    refs = {_extract_image_ref_id(match) for match in IMAGE_REF_PATTERN.findall(raw_table)}
    return {ref for ref in refs if ref}


def _node_embedded_image_id(node: Any) -> str:
    metadata = getattr(node, "metadata", {}) or {}
    candidates = [
        str(metadata.get("image_id", "") or ""),
        str(metadata.get("image_path", "") or ""),
        str(metadata.get("source_image_path", "") or ""),
        str(getattr(node, "text", "") or ""),
    ]
    for candidate in candidates:
        ref = _extract_image_ref_id(candidate)
        if ref:
            return ref
    return ""


def _safe_page_no(node: Any) -> int:
    metadata = getattr(node, "metadata", {}) or {}
    value = metadata.get("page_no")
    try:
        return int(value)
    except (TypeError, ValueError):
        return 10**9


def _clone_query_bundle(query_bundle: QueryBundle) -> QueryBundle:
    embedding = query_bundle.embedding
    return QueryBundle(
        query_str=query_bundle.query_str,
        embedding=list(embedding) if embedding is not None else None,
    )


def _snapshot_retrieval_bundle(retrieval: dict[str, list[Any]]) -> dict[str, list[Any]]:
    return {
        key: [copy.deepcopy(node) for node in nodes]
        for key, nodes in retrieval.items()
    }


def _node_identity(node: Any) -> tuple[str, str]:
    metadata = getattr(node, "metadata", {}) or {}
    node_type = str(metadata.get("type", "") or metadata.get("block_type", "") or "text")
    for field in ("table_id", "image_id", "block_id", "node_id"):
        value = str(metadata.get(field, "") or "")
        if value:
            return (node_type, value)
    fallback = "|".join(
        [
            str(metadata.get("doc_id", "") or ""),
            str(metadata.get("page_no", "") or ""),
            str(getattr(node, "text", "") or "")[:120],
        ]
    )
    return (node_type, fallback)


def _merge_retrieval_bundles(
    retrievals: list[dict[str, list[Any]]],
    *,
    variant_penalties: list[float],
) -> dict[str, list[Any]]:
    merged: dict[str, list[Any]] = {
        "text_results": [],
        "image_results": [],
        "table_results": [],
    }
    for branch_name in merged:
        selected: dict[tuple[str, str], Any] = {}
        for retrieval, penalty in zip(retrievals, variant_penalties):
            for node in retrieval.get(branch_name, []):
                identity = _node_identity(node)
                adjusted_score = max(0.0, _safe_score(node) - penalty)
                current = selected.get(identity)
                if current is not None and _safe_score(current) >= adjusted_score:
                    continue
                snapshot = copy.deepcopy(node)
                snapshot.score = adjusted_score
                selected[identity] = snapshot
        merged[branch_name] = sorted(selected.values(), key=_safe_score, reverse=True)
    return merged


def _filter_branch_nodes(
    nodes: Iterable[Any],
    *,
    min_score: float,
    relative_margin: float,
) -> list[Any]:
    ranked = sorted(list(nodes), key=_safe_score, reverse=True)
    if not ranked:
        return []
    above_threshold = [node for node in ranked if _safe_score(node) >= min_score]
    if not above_threshold:
        return []
    top_score = _safe_score(above_threshold[0])
    min_relative_score = top_score - relative_margin
    return [
        node for node in above_threshold if _safe_score(node) >= min_relative_score
    ]


def _should_fallback_to_raw_branch(nodes: Iterable[Any], *, confidence_floor: float) -> bool:
    ranked = sorted(list(nodes), key=_safe_score, reverse=True)
    if not ranked:
        return True
    return _safe_score(ranked[0]) < confidence_floor


def _build_table_prompt_preview(node: Any) -> str:
    metadata = getattr(node, "metadata", {}) or {}
    semantic_summary = _truncate_for_prompt(
        str(metadata.get("semantic_summary", "") or metadata.get("summary", "") or ""),
        TABLE_SUMMARY_CHAR_LIMIT,
    )
    headers = metadata.get("headers", []) or []
    normalized_text = str(metadata.get("normalized_table_text", "") or "").strip()

    preview_lines: list[str] = []
    if semantic_summary:
        preview_lines.append(f"Summary={semantic_summary}")
    if headers:
        preview_lines.append(
            "Columns=" + "|".join(str(header).strip() for header in headers if str(header).strip())
        )
    row_matches = re.findall(r"row\d+=([^;\n]+)", normalized_text, re.IGNORECASE)
    for index, row in enumerate(row_matches[:TABLE_PREVIEW_ROW_LIMIT], start=1):
        preview_lines.append(f"SampleRow{index}={_truncate_for_prompt(row, TABLE_PREVIEW_ROW_CHAR_LIMIT)}")
    if not preview_lines and normalized_text:
        preview_lines.append(_truncate_for_prompt(normalized_text, TABLE_PREVIEW_ROW_CHAR_LIMIT))

    return "\n".join(preview_lines) or "No table summary"


def _node_reference_label(node: Any) -> str:
    metadata = getattr(node, "metadata", {}) or {}
    node_type = metadata.get("type", "")
    if node_type == "table_block":
        return str(
            metadata.get("caption")
            or metadata.get("semantic_summary")
            or metadata.get("summary")
            or metadata.get("table_id")
            or "related table"
        )
    if node_type == "image_description":
        return str(
            metadata.get("summary")
            or metadata.get("caption")
            or metadata.get("image_id")
            or "related image"
        )
    return str(metadata.get("block_id") or "related content")


def _node_display_order_key(node: Any) -> tuple[int, tuple[int, ...], str]:
    reference = _node_reference_label(node)
    numbers = tuple(int(value) for value in NUMBER_PATTERN.findall(reference))
    return (_safe_page_no(node), numbers, reference)


def _sort_nodes_for_display(nodes: Iterable[Any]) -> list[Any]:
    node_list = list(nodes)
    if any(_safe_page_no(node) < 10**9 for node in node_list):
        return sorted(node_list, key=_node_display_order_key)
    return node_list


def _answer_asset_order_key(node: Any) -> tuple[int, int, tuple[int, ...], str]:
    metadata = getattr(node, "metadata", {}) or {}
    node_type = metadata.get("type", "")
    if node_type == "table_block":
        type_priority = 0
    elif node_type == "image_description":
        type_priority = 1
    else:
        type_priority = 2
    page_no, numbers, reference = _node_display_order_key(node)
    return (type_priority, page_no, numbers, reference)


def _sort_answer_assets(nodes: Iterable[Any]) -> list[Any]:
    return sorted(list(nodes), key=_answer_asset_order_key)


def _empty_retrieval_bundle() -> dict[str, list[Any]]:
    return {
        "text_results": [],
        "image_results": [],
        "table_results": [],
    }


# ============================================================
# QueryBackend — main query orchestrator
# ============================================================

class QueryBackend:
    """
    Multi-collection retrieval backend with query expansion, reranking,
    filtering, and LLM answer generation.

    Created per-request with credentials and kb_id.
    """

    def __init__(self, creds: RequestCredentials, kb_id: str) -> None:
        self.creds = creds
        self.kb_id = kb_id

        self.embed_model = create_embedding_model(
            model_name=creds.embedding_model,
            api_key=creds.embedding_api_key,
            api_base=creds.embedding_base_url or None,
        )

        # Load indexes from PGVectorStore
        self.text_index = self._load_index(PGVECTOR_TEXT_TABLE)
        self.image_index = self._load_index(PGVECTOR_IMAGE_TABLE)
        self.table_index = self._load_index(PGVECTOR_TABLE_TABLE)

        self.llm = create_text_llm(
            model_name=creds.llm_model,
            api_key=creds.llm_api_key,
            api_base=creds.llm_base_url or None,
            disable_thinking=not WEB_ANSWER_ENABLE_THINKING,
        )
        self.reranker = self._build_reranker()
        self._embedding_cache: dict[str, list[float]] = {}

    def _load_index(self, table_name: str) -> VectorStoreIndex | None:
        try:
            store = create_pgvector_store(table_name)
            return VectorStoreIndex.from_vector_store(
                vector_store=store,
                embed_model=self.embed_model,
            )
        except Exception as exc:
            LOGGER.warning("Could not load index for table %s: %s", table_name, exc)
            return None

    def _build_reranker(self) -> Reranker | None:
        creds = self.creds
        if not creds.rerank_enabled or not creds.rerank_api_key:
            return None
        return Reranker(
            api_key=creds.rerank_api_key,
            api_base=creds.rerank_base_url,
            model_name=creds.rerank_model,
            top_n=max(TEXT_SIMILARITY_TOP_K, IMAGE_SIMILARITY_TOP_K, TABLE_SIMILARITY_TOP_K),
            timeout=RERANK_TIMEOUT_SECONDS,
        )

    def _kb_filters(self) -> MetadataFilters:
        return MetadataFilters(
            filters=[MetadataFilter(key="kb_id", value=self.kb_id)]
        )

    # --- Embedding cache ---

    def _ensure_embedding_cache(self) -> dict[str, list[float]]:
        cache = getattr(self, "_embedding_cache", None)
        if cache is None:
            cache = {}
            self._embedding_cache = cache
        return cache

    def _get_cached_embedding(self, query: str) -> list[float] | None:
        if self.embed_model is None:
            return None
        cache = self._ensure_embedding_cache()
        if query not in cache:
            if len(cache) >= _EMBEDDING_CACHE_MAX:
                cache.pop(next(iter(cache)))
            cache[query] = self.embed_model.get_query_embedding(query)
        return cache[query]

    def _prefetch_embeddings(self, queries: list[str]) -> None:
        if self.embed_model is None:
            return
        cache = self._ensure_embedding_cache()
        missing = [q for q in queries if q not in cache]
        if len(missing) <= 1:
            for q in missing:
                self._get_cached_embedding(q)
            return
        with ThreadPoolExecutor(max_workers=len(missing)) as executor:
            futures = [(q, executor.submit(self.embed_model.get_query_embedding, q)) for q in missing]
        for q, fut in futures:
            if len(cache) >= _EMBEDDING_CACHE_MAX:
                cache.pop(next(iter(cache)))
            cache[q] = fut.result()

    def _build_query_bundle(self, query: str) -> QueryBundle:
        return QueryBundle(query_str=query, embedding=self._get_cached_embedding(query))

    # --- Query expansion ---

    def build_query_variants(self, query: str) -> list[str]:
        normalized_query = (query or "").strip()
        if not normalized_query or not _contains_cjk(normalized_query):
            return [normalized_query]

        english_terms: list[str] = []
        ascii_terms = ASCII_TERM_PATTERN.findall(normalized_query)
        uppercase_terms = {term.upper() for term in ascii_terms}

        for acronym in sorted(uppercase_terms):
            if acronym in QUERY_TERM_EXPANSIONS:
                _append_unique_terms(english_terms, QUERY_TERM_EXPANSIONS[acronym])

        matched_phrase = False
        for aliases, expansions in QUERY_PHRASE_EXPANSIONS:
            if any(alias in normalized_query for alias in aliases):
                matched_phrase = True
                _append_unique_terms(english_terms, expansions)

        should_expand = bool(english_terms) and (matched_phrase or bool(uppercase_terms))
        if not should_expand:
            return [normalized_query]

        mixed_query = " ".join([normalized_query, *english_terms]).strip()
        if mixed_query == normalized_query:
            return [normalized_query]
        return [normalized_query, mixed_query]

    # --- Retrieval ---

    def _retrieve_branch(
        self,
        index: Any,
        *,
        similarity_top_k: int,
        query_bundle: QueryBundle,
    ) -> list[Any]:
        if index is None:
            return []
        retriever = index.as_retriever(
            similarity_top_k=similarity_top_k,
            filters=self._kb_filters(),
        )
        return retriever.retrieve(_clone_query_bundle(query_bundle))

    def _retrieve_once(self, query: str) -> dict[str, list[Any]]:
        t_total = time.perf_counter()

        query_variants = self.build_query_variants(query)
        LOGGER.info("[query   ] variants=%d  %s", len(query_variants), query_variants)

        branch_specs = [
            ("text_results", self.text_index, TEXT_SIMILARITY_TOP_K),
            ("image_results", self.image_index, IMAGE_SIMILARITY_TOP_K),
            ("table_results", self.table_index, TABLE_SIMILARITY_TOP_K),
        ]
        active_branches = [spec for spec in branch_specs if spec[1] is not None]

        t_embed = time.perf_counter()
        self._prefetch_embeddings(query_variants)
        LOGGER.info("[embed   ] %5.0fms  queries=%d", (time.perf_counter() - t_embed) * 1000, len(query_variants))

        variant_retrievals: list[dict[str, list[Any]]] = []
        variant_penalties: list[float] = []

        for variant_index, variant_query in enumerate(query_variants):
            query_bundle = self._build_query_bundle(variant_query)
            variant_result: dict[str, list[Any]] = _empty_retrieval_bundle()

            t_pgvector = time.perf_counter()
            if len(active_branches) <= 1:
                for key, index, top_k in active_branches:
                    variant_result[key] = self._retrieve_branch(
                        index,
                        similarity_top_k=top_k,
                        query_bundle=query_bundle,
                    )
            else:
                with ThreadPoolExecutor(max_workers=len(active_branches)) as executor:
                    future_map = {
                        executor.submit(
                            self._retrieve_branch,
                            index,
                            similarity_top_k=top_k,
                            query_bundle=query_bundle,
                        ): key
                        for key, index, top_k in active_branches
                    }
                    for future, key in future_map.items():
                        variant_result[key] = future.result()
            LOGGER.info(
                "[pgvector] %5.0fms  variant=%d  text=%d img=%d tbl=%d",
                (time.perf_counter() - t_pgvector) * 1000,
                variant_index,
                len(variant_result["text_results"]),
                len(variant_result["image_results"]),
                len(variant_result["table_results"]),
            )

            variant_retrievals.append(variant_result)
            variant_penalties.append(variant_index * QUERY_EXPANSION_SCORE_PENALTY)

        retrieval = _merge_retrieval_bundles(
            variant_retrievals,
            variant_penalties=variant_penalties,
        )
        LOGGER.info(
            "[merge   ]  merged  text=%d img=%d tbl=%d",
            len(retrieval.get("text_results", [])),
            len(retrieval.get("image_results", [])),
            len(retrieval.get("table_results", [])),
        )

        raw_snapshot = _snapshot_retrieval_bundle(retrieval)
        reranked_text_only = {
            "text_results": retrieval.get("text_results", []),
            "image_results": [],
            "table_results": [],
        }
        n_before_rerank = len(reranked_text_only["text_results"])
        t_rerank = time.perf_counter()
        reranked_text_only = rerank_retrieval_bundle(
            query=query,
            retrieval=reranked_text_only,
            reranker=self.reranker,
            top_n_map={"text_results": TEXT_SIMILARITY_TOP_K},
        )
        LOGGER.info(
            "[rerank  ] %5.0fms  text %d->%d",
            (time.perf_counter() - t_rerank) * 1000,
            n_before_rerank,
            len(reranked_text_only.get("text_results", [])),
        )

        merged_after_rerank = {
            "text_results": reranked_text_only.get("text_results", []),
            "image_results": raw_snapshot.get("image_results", []),
            "table_results": raw_snapshot.get("table_results", []),
        }
        result = self.filter_retrieval(
            merged_after_rerank,
            raw_retrieval=raw_snapshot,
            reranked_branches=(
                set(RERANKED_BRANCH_KEYS)
                if self.reranker is not None and getattr(self.reranker, "enabled", True)
                else set()
            ),
        )
        LOGGER.info(
            "[filter  ]  after filter  text=%d img=%d tbl=%d",
            len(result.get("text_results", [])),
            len(result.get("image_results", [])),
            len(result.get("table_results", [])),
        )
        LOGGER.info("[retrieve] %5.0fms  total", (time.perf_counter() - t_total) * 1000)
        return result

    def filter_retrieval(
        self,
        retrieval: dict[str, list[Any]],
        *,
        raw_retrieval: dict[str, list[Any]] | None = None,
        reranked_branches: set[str] | None = None,
    ) -> dict[str, list[Any]]:
        reranked_branches = (
            set(reranked_branches)
            if reranked_branches is not None
            else (
                {"text_results", "image_results", "table_results"}
                if self.reranker is not None and getattr(self.reranker, "enabled", True)
                else set()
            )
        )
        branch_rules = {
            "text_results": (TEXT_RETRIEVAL_SCORE_THRESHOLD, TEXT_RETRIEVAL_SCORE_MARGIN),
            "image_results": (IMAGE_RETRIEVAL_SCORE_THRESHOLD, IMAGE_RETRIEVAL_SCORE_MARGIN),
            "table_results": (TABLE_RETRIEVAL_SCORE_THRESHOLD, TABLE_RETRIEVAL_SCORE_MARGIN),
        }
        filtered: dict[str, list[Any]] = {}
        for key, (threshold, margin) in branch_rules.items():
            reranked_nodes = retrieval.get(key, [])
            branch_nodes = reranked_nodes
            use_absolute_threshold = key in reranked_branches
            branch_min_score = threshold if use_absolute_threshold else 0.0

            if use_absolute_threshold and raw_retrieval is not None and _should_fallback_to_raw_branch(
                reranked_nodes,
                confidence_floor=RERANK_CONFIDENCE_FLOOR,
            ):
                branch_nodes = raw_retrieval.get(key, [])
                branch_min_score = 0.0

            filtered[key] = _filter_branch_nodes(
                branch_nodes,
                min_score=branch_min_score,
                relative_margin=margin,
            )
        return filtered

    def retrieve(self, query: str) -> dict[str, list[Any]]:
        last_error: Exception | None = None
        for attempt in range(RETRIEVAL_RETRIES + 1):
            try:
                return self._retrieve_once(query)
            except Exception as exc:
                last_error = exc
                if attempt >= RETRIEVAL_RETRIES:
                    break
                time.sleep(RETRIEVAL_RETRY_DELAY_SECONDS * (attempt + 1))
        raise RuntimeError(str(last_error) if last_error else "Retrieval failed")

    # --- Answer assets & sources ---

    def select_answer_assets(self, retrieval: dict[str, list[Any]]) -> list[Any]:
        candidates = sorted(
            list(retrieval.get("image_results", [])) + list(retrieval.get("table_results", [])),
            key=_safe_score,
            reverse=True,
        )
        filtered = [node for node in candidates if _safe_score(node) >= ANSWER_ASSET_SCORE_THRESHOLD]

        selected: list[Any] = []
        selected_table_image_refs: set[str] = set()

        for node in filtered:
            metadata = getattr(node, "metadata", {}) or {}
            node_type = metadata.get("type", "")

            if node_type == "image_description":
                image_ref = _node_embedded_image_id(node)
                if image_ref and image_ref in selected_table_image_refs:
                    continue
                selected.append(node)
            elif node_type == "table_block":
                selected.append(node)
                selected_table_image_refs.update(_extract_table_embedded_image_ids(node))
                if selected_table_image_refs:
                    selected = [
                        item
                        for item in selected
                        if (
                            (getattr(item, "metadata", {}) or {}).get("type", "") != "image_description"
                            or _node_embedded_image_id(item) not in selected_table_image_refs
                        )
                    ]
                    if node not in selected:
                        selected.append(node)
            else:
                selected.append(node)

            selected = _dedupe_nodes(selected)
            if len(selected) > ANSWER_ASSET_TOP_K:
                selected = selected[:ANSWER_ASSET_TOP_K]

        return _sort_answer_assets(selected[:ANSWER_ASSET_TOP_K])

    def select_answer_sources(self, retrieval: dict[str, list[Any]], answer_assets: list[Any]) -> list[Any]:
        text_results = sorted(retrieval.get("text_results", []), key=_safe_score, reverse=True)
        candidate_sources = text_results[:2] + answer_assets
        return _sort_nodes_for_display(_dedupe_nodes(candidate_sources))

    # --- Prompt & answer generation ---

    def build_answer_prompt(
        self,
        query: str,
        retrieval: dict[str, list[Any]],
        answer_assets: list[Any],
    ) -> str:
        text_context = []
        for index, node in enumerate(retrieval.get("text_results", [])[:TEXT_CONTEXT_TOP_K], start=1):
            metadata = getattr(node, "metadata", {}) or {}
            text_context.append(
                f"[Text{index}] page={metadata.get('page_label', metadata.get('page_no', '-'))}\n"
                f"{_truncate_for_prompt(str(getattr(node, 'text', '') or ''), TEXT_CONTEXT_CHAR_LIMIT)}"
            )

        image_context = []
        for index, node in enumerate(
            _sort_nodes_for_display(retrieval.get("image_results", [])[:IMAGE_CONTEXT_TOP_K]),
            start=1,
        ):
            metadata = getattr(node, "metadata", {}) or {}
            image_context.append(
                f"[Image{index}] name={_node_reference_label(node)} page={metadata.get('page_label', metadata.get('page_no', '-'))} "
                f"summary={_truncate_for_prompt(str(metadata.get('summary', '') or ''), IMAGE_SUMMARY_CHAR_LIMIT)}"
            )

        table_context = []
        for index, node in enumerate(
            _sort_nodes_for_display(retrieval.get("table_results", [])[:TABLE_CONTEXT_TOP_K]),
            start=1,
        ):
            metadata = getattr(node, "metadata", {}) or {}
            table_context.append(
                f"[Table{index}] caption={_node_reference_label(node)} page={metadata.get('page_label', metadata.get('page_no', '-'))}\n"
                f"{_build_table_prompt_preview(node)}"
            )

        answer_asset_ids = []
        for node in _sort_nodes_for_display(answer_assets):
            metadata = getattr(node, "metadata", {}) or {}
            if metadata.get("image_id"):
                answer_asset_ids.append(f"Image:{_node_reference_label(node)}")
            if metadata.get("table_id"):
                answer_asset_ids.append(f"Table:{_node_reference_label(node)}")

        return (
            "You are a rigorous RAG question-answering assistant. Answer strictly based on the given context. Do not fabricate.\n"
            "If the evidence is insufficient, clearly state so.\n"
            "If relevant images or tables are listed below, naturally mention 'see related image/table' in your answer.\n"
            "When citing charts, use only titles or names, never internal IDs or filenames.\n"
            f"Recommended assets to return with answer: {', '.join(answer_asset_ids) if answer_asset_ids else 'none'}\n\n"
            f"Question: {query}\n\n"
            "Text evidence:\n"
            f"{chr(10).join(text_context) or 'none'}\n\n"
            "Image evidence:\n"
            f"{chr(10).join(image_context) or 'none'}\n\n"
            "Table evidence:\n"
            f"{chr(10).join(table_context) or 'none'}\n\n"
            "Please provide a concise, direct answer."
        )

    def answer(self, query: str, retrieval: dict[str, list[Any]] | None = None) -> dict[str, Any]:
        retrieval = retrieval or self.retrieve(query)
        answer_assets = self.select_answer_assets(retrieval)
        answer_sources = self.select_answer_sources(retrieval, answer_assets)
        prompt = self.build_answer_prompt(query, retrieval, answer_assets)
        response = self.llm.complete(prompt)
        return {
            "answer": response.text or "",
            "answer_sources": answer_sources,
            "answer_assets": answer_assets,
        }

    def stream_answer(self, query: str, retrieval: dict[str, list[Any]] | None = None):
        retrieval = retrieval or self.retrieve(query)
        answer_assets = self.select_answer_assets(retrieval)
        answer_sources = self.select_answer_sources(retrieval, answer_assets)
        prompt = self.build_answer_prompt(query, retrieval, answer_assets)
        return {
            "stream": self.llm.stream_complete(prompt),
            "answer_sources": answer_sources,
            "answer_assets": answer_assets,
        }
