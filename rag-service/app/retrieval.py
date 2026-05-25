"""
Hybrid retrieval over the new Postgres-native RAG store.

Single entry point `retrieve()` that:
  1) Routes the query against rag.doc_profile to pick candidate docs
  2) Runs FTS + vector search in parallel over PDF pages and Excel chunks
  3) Merges with RRF
  4) Expands neighbors (adjacent PDF pages / adjacent Excel chunks)
  5) Optionally streams an LLM answer over the retrieved context
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, AsyncIterator

from app.config import (
    LLM_RENDER_JPEG_QUALITY,
    LLM_RENDER_MAX_PIXELS,
    MULTI_DOC_PER_DOC_PAGE_LIMIT,
    MULTI_DOC_SINGLE_DOC_PAGE_LIMIT,
    MULTI_DOC_TOTAL_PAGE_BUDGET,
    RequestCredentials,
)
from app.embedding import build_llm_client, encode_texts
from app.fts import tokenize_for_query
from app.pdf_pipeline import load_selected_page_data_urls, render_dir_for
from app.storage import (
    get_doc_profiles_bulk,
    get_page_ocr_text_map,
    get_excel_chunks_by_positions,
    get_pages_by_indices,
    list_doc_keywords,
    phrase_search_pages,
    route_documents,
    search_excel_policy_chunks,
    search_pages_fts,
    search_pages_vector,
    vector_search_excel_policy_chunks,
)

logger = logging.getLogger(__name__)

ROUTE_TOP_N = 4           # candidate documents per question
PER_SOURCE_TOP_K = 5      # hits per FTS/vector source before fusion
RRF_K = 60                # standard RRF constant

DOCUMENT_RELEVANCE_FILTER_PROMPT = """你是文档相关性判断助手。

系统已经先在多个文档中召回到了页面。请根据用户问题、文档名和文档画像摘要，判断哪些文档真正可能帮助回答问题。

判断标准：
- 文档必须包含问题涉及的实体、缩写、主题或流程，或者明显是同一业务领域资料。
- 宁可多选也不要漏选；但明显无关的文档不要选。
- 如果无法判断，保留可能相关的文档。

只返回 JSON，格式：{"relevant_document_ids": ["doc-id-1", "doc-id-2"]}
不要返回解释文字。"""


QUERY_UNDERSTANDING_SYSTEM_PROMPT = """You are a retrieval query planner for multilingual PDF search.
You only rewrite the user's question into a compact JSON retrieval plan.

Rules:
1. Do not answer the question.
2. Always output a single JSON object only.
3. Infer search-friendly variants, likely English terms, abbreviations, and attachment or section hints when helpful.
4. Prefer high-recall retrieval queries over conversational phrasing.
5. scope must be one of: targeted, broad, overview.
6. For all-caps acronyms, keep the original acronym and obvious punctuation variants, but do not invent expanded meanings unless the user provided them.

JSON schema:
{
  "normalized_query": string,
  "query_variants": [string],
  "aliases": [string],
  "keywords": [string],
  "likely_sections": [string],
  "scope": "targeted" | "broad" | "overview"
}
"""

# ── Cross-reference / TOC / form patterns ───────────────────────────
# Ported verbatim from llm-rag/pdf_qa.py so behavior matches.

CROSS_REFERENCE_PATTERN = re.compile(
    r"\b(?:Attachment|Appendix)\s+\d+[A-Z]?\b", re.IGNORECASE,
)
TITLE_REFERENCE_PATTERN = re.compile(
    r"([A-Za-z0-9][A-Za-z0-9/&,\- ]{5,120}?)\s*\((?:Attachment|Appendix)\s+\d+[A-Z]?\)",
    re.IGNORECASE,
)
TOC_HINT_PATTERN = re.compile(
    r"\b(?:appendix\s+list|table\s+of\s+contents|contents)\b|\.{3,}",
    re.IGNORECASE,
)
REFERENCE_TARGET_HINT_PATTERN = re.compile(
    r"^\s*(?:SECTION\s+[A-Z0-9 ]*:?\s*)?(?:Attachment|Appendix)\s+\d+[A-Z]?\b",
    re.IGNORECASE,
)
FORM_TEMPLATE_FIELD_HINTS = (
    "issue to",
    "lot no",
    "date/time",
    "problem description",
    "root cause",
    "corrective / preventive action",
    "failure category",
    "containment/immediate actions",
    "verification of corrective / preventive action",
)


def is_toc_like_page(text: str) -> bool:
    cleaned = " ".join(str(text or "").split())
    if not cleaned:
        return False
    references = {match.upper() for match in CROSS_REFERENCE_PATTERN.findall(cleaned)}
    reference_count = len(CROSS_REFERENCE_PATTERN.findall(cleaned))
    if TOC_HINT_PATTERN.search(cleaned):
        return True
    if cleaned.lower().startswith("no attachment title"):
        return True
    if len(references) >= 4:
        return True
    if cleaned.count("Appendix") + cleaned.count("Attachment") >= 6:
        return True
    if reference_count >= 3 and len(cleaned) <= 260:
        return True
    return False


def is_reference_target_page(text: str) -> bool:
    cleaned = " ".join(str(text or "").split())
    if not cleaned or is_toc_like_page(cleaned):
        return False
    return bool(REFERENCE_TARGET_HINT_PATTERN.search(cleaned[:220]))


def extract_cross_reference_queries(text: str) -> list[str]:
    """Pull "Attachment 1A" / titled-reference strings out of a page's text."""
    seen: set[str] = set()
    queries: list[str] = []
    source = str(text or "")

    for match in TITLE_REFERENCE_PATTERN.findall(source):
        normalized = " ".join(match.split())
        normalized = re.sub(r"^[0-9]+(?:\.[0-9]+)*[.):\-]?\s+", "", normalized).strip(" :-")
        key = normalized.upper()
        if len(normalized) < 8 or key in seen:
            continue
        seen.add(key)
        queries.append(normalized)

    for match in CROSS_REFERENCE_PATTERN.findall(source):
        normalized = " ".join(match.split())
        key = normalized.upper()
        if key in seen:
            continue
        seen.add(key)
        queries.append(normalized)
    return queries


GENERIC_QUERY_PREFIX_PATTERN = re.compile(
    r"^(?:请问|请帮我|帮我|麻烦|想知道|查一下|查查|查询|查看|帮忙|请|查)\s*",
    re.IGNORECASE,
)
GENERIC_QUERY_SUFFIX_PATTERN = re.compile(
    r"(?:的内容|内容是什么|是什么|有哪些|在哪个条款|在哪条|在哪个章节|在哪一条|在哪|怎么写|如何填写|怎么填)\s*$",
    re.IGNORECASE,
)
CJK_QUERY_CHUNK_PATTERN = re.compile(r"[\u4e00-\u9fff]{2,}")
RETRIEVAL_ALIAS_MAP = {
    "不合格报告": ["NCR", "NCR report", "Non Conformance Report", "non-conformance report"],
    "文件和记录": ["Document and Records", "document and records"],
    "on-hold卡片": ["ON-HOLD CARD", "On hold card", "Attachment A-1"],
    "隔离卡": ["ON-HOLD CARD", "Quarantine", "Attachment A-1"],
}
QUERY_UNDERSTANDING_MAX_TOKENS = 256


def _extract_json_object(text: str) -> dict[str, Any]:
    cleaned = str(text or "").strip()
    if not cleaned:
        return {}
    try:
        payload = json.loads(cleaned)
        return payload if isinstance(payload, dict) else {}
    except Exception:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            payload = json.loads(cleaned[start : end + 1])
            return payload if isinstance(payload, dict) else {}
        except Exception:
            return {}
    return {}


def _coerce_string_list(value: object, *, limit: int) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = " ".join(str(item or "").split()).strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
        if len(result) >= limit:
            break
    return result


def _preview_text(text: str, *, limit: int = 120) -> str:
    cleaned = " ".join(str(text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


def _safe_first_choice(response: Any, context: str) -> Any:
    """Return response.choices[0] or log a clear diagnostic when choices is empty."""
    if not getattr(response, "choices", None):
        logger.error(
            "[llm.empty_choices] context=%s model=%s response_keys=%s",
            context,
            getattr(response, "model", "unknown"),
            sorted(getattr(response, "model_extra", {}) or {}),
        )
        raise RuntimeError(
            f"LLM returned empty choices ({context}). "
            "Check the API key, model name, and base URL for the LLM provider."
        )
    return response.choices[0]


def understand_retrieval_query(question: str, creds: RequestCredentials) -> dict[str, Any]:
    source = " ".join(str(question or "").split()).strip()
    if not source:
        return {}

    client = build_llm_client(creds)
    model = creds.llm_model or "qwen-plus"
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": QUERY_UNDERSTANDING_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Rewrite the following user question into a retrieval JSON plan. "
                    "Return JSON only.\n"
                    f"Question: {source}"
                ),
            },
        ],
        max_tokens=QUERY_UNDERSTANDING_MAX_TOKENS,
        temperature=0,
        response_format={"type": "json_object"},
        extra_body={"enable_thinking": False},
    )
    choice = _safe_first_choice(response, "query-understanding")
    parsed = _extract_json_object(choice.message.content or "")
    if not parsed:
        logger.warning("[query.understanding.invalid] question=%r", _preview_text(question))
        return {}
    plan = {
        "normalized_query": " ".join(str(parsed.get("normalized_query") or "").split()).strip(),
        "query_variants": _coerce_string_list(parsed.get("query_variants"), limit=8),
        "aliases": _coerce_string_list(parsed.get("aliases"), limit=8),
        "keywords": _coerce_string_list(parsed.get("keywords"), limit=8),
        "likely_sections": _coerce_string_list(parsed.get("likely_sections"), limit=6),
        "scope": str(parsed.get("scope") or "").strip().lower(),
    }
    logger.info(
        "[query.understanding] question=%r normalized=%r variants=%s aliases=%s keywords=%s sections=%s scope=%s",
        _preview_text(question),
        plan["normalized_query"],
        plan["query_variants"],
        plan["aliases"],
        plan["keywords"],
        plan["likely_sections"],
        plan["scope"],
    )
    return plan


def build_query_variants(question: str, query_plan: dict[str, Any] | None = None) -> list[str]:
    source = " ".join(str(question or "").split())
    if not source:
        return []

    variants: list[str] = []
    seen: set[str] = set()

    def add(candidate: str) -> None:
        normalized = " ".join(str(candidate or "").split()).strip()
        key = normalized.casefold()
        if len(normalized) < 2 or key in seen:
            return
        seen.add(key)
        variants.append(normalized)

    add(source)
    if query_plan:
        add(query_plan.get("normalized_query") or "")
        for field in ("query_variants", "aliases", "keywords", "likely_sections"):
            for value in query_plan.get(field) or []:
                add(value)

    trimmed = GENERIC_QUERY_PREFIX_PATTERN.sub("", source)
    trimmed = GENERIC_QUERY_SUFFIX_PATTERN.sub("", trimmed).strip(" ：:，,。?？")
    add(trimmed)

    def add_cjk_fragments(value: str) -> None:
        for chunk in CJK_QUERY_CHUNK_PATTERN.findall(str(value or "")):
            add(chunk)
            for size in (4, 5, 6):
                if len(chunk) <= size:
                    continue
                for start in range(0, len(chunk) - size + 1):
                    add(chunk[start : start + size])

    add_cjk_fragments(source)
    add_cjk_fragments(trimmed)

    for term, aliases in RETRIEVAL_ALIAS_MAP.items():
        if term in source:
            add(term)
            for alias in aliases:
                add(alias)

    if trimmed and trimmed != source:
        for term, aliases in RETRIEVAL_ALIAS_MAP.items():
            if term in trimmed:
                for alias in aliases:
                    add(alias)

    if query_plan:
        for field in ("query_variants", "aliases", "keywords", "likely_sections"):
            for value in query_plan.get(field) or []:
                add_cjk_fragments(str(value or ""))

    return variants[:16]


def build_keyword_match_terms(question: str, query_plan: dict[str, Any] | None = None) -> list[str]:
    candidates = build_query_variants(question, query_plan=query_plan)
    seen: set[str] = set()
    ordered: list[str] = []

    def add(term: str) -> None:
        normalized = " ".join(str(term or "").split()).strip()
        if len(normalized) < 2:
            return
        key = normalized.casefold()
        if key in seen:
            return
        seen.add(key)
        ordered.append(normalized)

    for candidate in candidates:
        add(candidate)
        for chunk in CJK_QUERY_CHUNK_PATTERN.findall(candidate):
            add(chunk)
            for size in (2, 3, 4, 5, 6):
                if len(chunk) <= size:
                    continue
                for start in range(0, len(chunk) - size + 1):
                    add(chunk[start : start + size])

    return ordered[:32]


def _aggregate_query_tokens(variants: list[str]) -> list[str]:
    seen: set[str] = set()
    tokens: list[str] = []
    for variant in variants:
        for token in tokenize_for_query(variant):
            if token in seen:
                continue
            seen.add(token)
            tokens.append(token)
    return tokens


# ── Public API ───────────────────────────────────────────────────────

async def _retrieve_internal(
    *,
    kb_id: str,
    question: str,
    creds: RequestCredentials,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Run hybrid retrieval; return (page_hits, excel_hits) untrimmed.

    Callers that only need display-sized sources should use `retrieve()`
    which wraps this with `_to_sources()`.
    """
    query_plan: dict[str, Any] = {}
    try:
        query_plan = await asyncio.to_thread(understand_retrieval_query, question, creds)
    except Exception as exc:
        logger.warning("[query.understanding.error] question=%r error=%s", _preview_text(question), exc)

    query_variants = build_query_variants(question, query_plan=query_plan)
    query_tokens = _aggregate_query_tokens(query_variants or [question])
    route_query = query_plan.get("normalized_query") or (query_variants[0] if query_variants else question)
    embedding = _embed_query(route_query, creds)

    candidate_doc_ids = await _route(kb_id, question, query_tokens, embedding)

    page_hits, excel_hits = await asyncio.gather(
        _search_pages(kb_id, question, query_plan, query_variants, query_tokens, creds, candidate_doc_ids),
        _search_excel(kb_id, query_tokens, embedding, candidate_doc_ids),
    )

    page_hits = await _expand_page_neighbors(kb_id, page_hits)
    excel_hits = await _expand_excel_neighbors(kb_id, excel_hits)

    # Follow "Refer to Attachment 1A" / "Appendix 4" jumps from each hit
    # page into the pages they reference (within the same doc).
    page_hits = await _expand_page_cross_references(kb_id, page_hits)

    # Demote / drop pure-TOC pages so the LLM doesn't waste an image slot.
    page_hits = _deprioritize_toc_pages(page_hits)

    # Cull pages from documents the LLM judges irrelevant to the question.
    # Skipped automatically when only one doc was hit (the filter is a noop).
    page_hits = await _filter_page_hits_by_relevance(
        kb_id=kb_id, question=question, page_hits=page_hits, creds=creds,
    )

    return page_hits, excel_hits


async def _expand_page_cross_references(
    kb_id: str, hits: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """For every hit page, extract Attachment/Appendix references in its
    text and add the target pages (within the same doc) to the hit set.

    Mirrors llm-rag/pdf_qa.py:expand_cross_reference_pages — uses a
    phrase / FTS pass per query, prefers reference-target pages and
    skips TOC-like pages.
    """
    if not hits:
        return hits

    by_doc: dict[str, list[dict[str, Any]]] = {}
    for hit in hits:
        doc_id = hit.get("doc_id")
        if not doc_id:
            continue
        by_doc.setdefault(doc_id, []).append(hit)

    extras: list[dict[str, Any]] = []
    seen_ids = {h.get("id") for h in hits}

    for doc_id, doc_hits in by_doc.items():
        queries: list[str] = []
        seen_queries: set[str] = set()
        for hit in doc_hits:
            for query in extract_cross_reference_queries(hit.get("text") or ""):
                key = query.upper()
                if key in seen_queries:
                    continue
                seen_queries.add(key)
                queries.append(query)

        if not queries:
            continue

        for query in queries[:8]:
            if " " in query and not query.lower().startswith(("attachment ", "appendix ")):
                hits_for_query = await phrase_search_pages(
                    kb_id=kb_id, query=query, doc_ids=[doc_id], top_k=10,
                )
            else:
                tokens = tokenize_for_query(query)
                if not tokens:
                    continue
                hits_for_query = await search_pages_fts(
                    kb_id=kb_id, query_tokens=tokens, doc_ids=[doc_id], top_k=8,
                )

            if not hits_for_query:
                continue

            target_hits = [
                h for h in hits_for_query if is_reference_target_page(h.get("text") or "")
            ]
            non_toc_hits = [
                h for h in hits_for_query if not is_toc_like_page(h.get("text") or "")
            ]
            effective_hits = target_hits or non_toc_hits or hits_for_query

            for h in effective_hits:
                hid = h.get("id")
                if hid in seen_ids:
                    continue
                seen_ids.add(hid)
                # Mark as a follow-up so downstream callers know why this
                # page is in the set even though it didn't match directly.
                h.setdefault("retrieval_sources", []).append("cross_ref")
                extras.append(h)

    if not extras:
        return hits
    logger.info(
        "[cross_ref.expand] added=%s seed_hits=%s",
        len(extras), len(hits),
    )
    return hits + extras


def _deprioritize_toc_pages(hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Push TOC-like pages to the back so they only get used as a last
    resort. Doesn't drop them outright — sometimes the TOC is what the
    user actually asked about.
    """
    if not hits:
        return hits
    primary: list[dict[str, Any]] = []
    demoted: list[dict[str, Any]] = []
    for hit in hits:
        if is_toc_like_page(hit.get("text") or ""):
            demoted.append(hit)
        else:
            primary.append(hit)
    return primary + demoted


async def _filter_page_hits_by_relevance(
    *,
    kb_id: str,
    question: str,
    page_hits: list[dict[str, Any]],
    creds: RequestCredentials,
) -> list[dict[str, Any]]:
    """Ask the LLM which of the hit documents are actually relevant.

    Ported from llm-rag/pdf_qa.py:filter_documents_by_relevance. Runs only
    when ≥2 docs are present. Returns the original list on any failure to
    avoid losing recall.
    """
    by_doc: dict[str, list[int]] = {}
    for hit in page_hits:
        doc_id = hit.get("doc_id")
        if not doc_id:
            continue
        page = int(hit.get("page_index", 0))
        by_doc.setdefault(doc_id, []).append(page)
    if len(by_doc) <= 1:
        return page_hits

    doc_ids = list(by_doc.keys())
    profiles = await get_doc_profiles_bulk(kb_id=kb_id, doc_ids=doc_ids)
    descriptions: list[str] = []
    for doc_id in doc_ids:
        profile = profiles.get(doc_id) or {}
        name = profile.get("file_name") or doc_id
        keywords = "、".join(profile.get("keywords") or [])
        aliases = "、".join(profile.get("title_aliases") or [])
        page_list = ", ".join(str(p) for p in sorted(set(by_doc[doc_id]))[:12])
        descriptions.append(
            f"[document_id={doc_id}]\n"
            f"文件名：{name}\n"
            f"文档类型：{profile.get('doc_type') or ''}\n"
            f"摘要：{profile.get('summary') or ''}\n"
            f"关键词：{keywords}\n"
            f"标题别名：{aliases}\n"
            f"内容分布：\n{(profile.get('chapter_summary') or '').strip()}\n"
            f"已召回页码：{page_list}"
        )

    user_message = f"用户问题：{question}\n\n" + "\n\n".join(descriptions)

    def _call_filter() -> set[str]:
        client = build_llm_client(creds)
        model = creds.llm_model or "qwen-plus"
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": DOCUMENT_RELEVANCE_FILTER_PROMPT},
                {"role": "user", "content": user_message},
            ],
            max_tokens=192,
            temperature=0,
            response_format={"type": "json_object"},
            extra_body={"enable_thinking": False},
        )
        choice = _safe_first_choice(response, "doc-relevance-filter")
        raw = choice.message.content or ""
        parsed = _extract_json_object(raw)
        relevant: set[str] = set()
        for value in parsed.get("relevant_document_ids") or []:
            key = str(value or "").strip()
            if key:
                relevant.add(key)
        return relevant

    try:
        relevant_ids = await asyncio.to_thread(_call_filter)
    except Exception as exc:
        logger.warning(
            "[doc.relevance_filter.error] question=%r error=%s",
            _preview_text(question), exc,
        )
        return page_hits

    if not relevant_ids:
        logger.warning(
            "[doc.relevance_filter] question=%r all_filtered_out fallback=all",
            _preview_text(question),
        )
        return page_hits

    filtered = [hit for hit in page_hits if hit.get("doc_id") in relevant_ids]
    if not filtered:
        return page_hits

    logger.info(
        "[doc.relevance_filter] question=%r before=%s after=%s relevant=%s",
        _preview_text(question),
        sorted(by_doc),
        sorted({h.get("doc_id") for h in filtered}),
        sorted(relevant_ids),
    )
    return filtered


async def retrieve(
    *,
    kb_id: str,
    question: str,
    creds: RequestCredentials,
    top_k: int = 5,
) -> dict[str, Any]:
    """Run hybrid retrieval. Returns display-sized sources (no LLM answer)."""
    page_hits, excel_hits = await _retrieve_internal(
        kb_id=kb_id, question=question, creds=creds,
    )
    sources = _to_sources(page_hits, excel_hits)[:top_k]
    return {"answer": "", "reasoning": "", "sources": sources, "assets": []}


async def retrieve_stream(
    *,
    kb_id: str,
    question: str,
    creds: RequestCredentials,
    generate_answer: bool,
    top_k: int = 5,
) -> AsyncIterator[bytes]:
    """SSE event stream. Emits 'sources', then 'reasoning'/'text' deltas if
    generate_answer is True, then 'done'.
    """
    page_hits, excel_hits = await _retrieve_internal(
        kb_id=kb_id, question=question, creds=creds,
    )
    sources = _to_sources(page_hits, excel_hits)[:top_k]
    yield _sse("sources", {"sources": sources})

    if not generate_answer:
        yield _sse("done", {"finished": True})
        return

    if not page_hits and not excel_hits:
        yield _sse("text", {"text": "未在该知识库中检索到相关内容。"})
        yield _sse("done", {"finished": True})
        return

    try:
        async for event in _stream_llm_events(
            kb_id=kb_id,
            question=question,
            page_hits=page_hits,
            excel_hits=excel_hits,
            creds=creds,
            enable_thinking=False,
        ):
            event_type = event.get("type") or "text"
            payload = {"text": event.get("text", "")}
            if event_type == "reasoning":
                yield _sse("reasoning", payload)
            else:
                yield _sse("text", payload)
    except Exception as exc:
        logger.exception("LLM streaming failed")
        yield _sse("error", {"message": str(exc)})
    yield _sse("done", {"finished": True})


async def suggest_default_queries(*, kb_id: str, limit: int = 5) -> list[str]:
    """Derive suggested queries from accumulated doc keywords. Cheap, no LLM."""
    keyword_lists = await list_doc_keywords(kb_id=kb_id, max_docs=10)
    flat: list[str] = []
    seen: set[str] = set()
    for kws in keyword_lists:
        for kw in kws:
            if kw and kw not in seen:
                seen.add(kw)
                flat.append(kw)
    # Turn each keyword into a question
    return [f"关于「{kw}」有什么信息？" for kw in flat[:limit]]


# ── Internals ────────────────────────────────────────────────────────

def _embed_query(question: str, creds: RequestCredentials) -> list[float] | None:
    if not creds.embedding_api_key:
        return None
    try:
        return encode_texts(creds, [question])[0]
    except Exception as exc:
        logger.warning("query embedding failed: %s", exc)
        return None


async def _route(
    kb_id: str, question: str, query_tokens: list[str], embedding: list[float] | None,
) -> list[str] | None:
    """Pick top-N candidate docs in the KB. Returns None to skip filtering."""
    rows = await route_documents(
        kb_id=kb_id, question=question, query_tokens=query_tokens, embedding=embedding, top_n=ROUTE_TOP_N,
    )
    if not rows:
        return None
    return [r["doc_id"] for r in rows]


async def _search_pages(
    kb_id: str,
    question: str,
    query_plan: dict[str, Any],
    query_variants: list[str],
    query_tokens: list[str],
    creds: RequestCredentials,
    doc_ids: list[str] | None,
) -> list[dict[str, Any]]:
    fts, phrase, keyword, vec = await asyncio.gather(
        _search_pages_fts_variants(kb_id, query_variants, query_tokens, doc_ids),
        _search_pages_phrase_variants(kb_id, query_variants, doc_ids),
        _search_pages_keyword(kb_id, question, query_plan, doc_ids),
        _search_pages_vector_variants(kb_id, query_variants, creds, doc_ids),
    )
    return _rrf_merge(
        [("keyword", keyword), ("phrase", phrase), ("fts", fts), ("vector", vec)],
        id_key="id",
    )


async def _search_pages_fts_variants(
    kb_id: str,
    query_variants: list[str],
    query_tokens: list[str],
    doc_ids: list[str] | None,
) -> list[dict[str, Any]]:
    variant_tokens = [_aggregate_query_tokens([variant]) for variant in query_variants[:8]]
    if query_tokens:
        variant_tokens.append(query_tokens)
    tasks = [
        search_pages_fts(
            kb_id=kb_id, query_tokens=tokens, doc_ids=doc_ids, top_k=PER_SOURCE_TOP_K,
        )
        for tokens in variant_tokens
        if tokens
    ]
    if not tasks:
        return []
    results = await asyncio.gather(*tasks)
    return _dedupe_hits([item for result in results for item in result])


async def _search_pages_phrase_variants(
    kb_id: str,
    query_variants: list[str],
    doc_ids: list[str] | None,
) -> list[dict[str, Any]]:
    tasks = [
        phrase_search_pages(kb_id=kb_id, query=variant, doc_ids=doc_ids, top_k=PER_SOURCE_TOP_K)
        for variant in query_variants[:8]
        if variant.strip()
    ]
    if not tasks:
        return []
    results = await asyncio.gather(*tasks)
    return _dedupe_hits([item for result in results for item in result])


async def _search_pages_vector_variants(
    kb_id: str,
    query_variants: list[str],
    creds: RequestCredentials,
    doc_ids: list[str] | None,
) -> list[dict[str, Any]]:
    variants = [variant.strip() for variant in query_variants[:8] if variant.strip()]
    if not variants or not creds.embedding_api_key:
        return []
    try:
        embeddings = await asyncio.to_thread(encode_texts, creds, variants)
    except Exception as exc:
        logger.warning("query variant embedding failed: %s", exc)
        return []

    tasks = [
        search_pages_vector(kb_id=kb_id, embedding=embedding, doc_ids=doc_ids, top_k=PER_SOURCE_TOP_K)
        for embedding in embeddings
        if embedding
    ]
    if not tasks:
        return []
    results = await asyncio.gather(*tasks, return_exceptions=True)
    hits: list[dict[str, Any]] = []
    for result in results:
        if isinstance(result, Exception):
            logger.warning("page vector search failed: %s", result)
            continue
        hits.extend(result)
    return _dedupe_hits(hits)


async def _search_pages_keyword(
    kb_id: str,
    question: str,
    query_plan: dict[str, Any],
    doc_ids: list[str] | None,
) -> list[dict[str, Any]]:
    terms = build_keyword_match_terms(question, query_plan=query_plan)
    if not terms or not doc_ids:
        return []
    tasks = [
        _score_keyword_match_doc(kb_id=kb_id, doc_id=doc_id, terms=terms, question=question)
        for doc_id in doc_ids
    ]
    results = await asyncio.gather(*tasks)
    return _dedupe_hits([item for result in results for item in result])


async def _score_keyword_match_doc(
    *, kb_id: str, doc_id: str, terms: list[str], question: str,
) -> list[dict[str, Any]]:
    page_text_map = await get_page_ocr_text_map(kb_id=kb_id, doc_id=doc_id)
    if not page_text_map:
        return []

    source_chunks = {
        chunk for chunk in CJK_QUERY_CHUNK_PATTERN.findall(str(question or "")) if len(chunk) >= 2
    }
    folded_source_chunks = [chunk.casefold() for chunk in source_chunks]
    ranked: list[tuple[int, int]] = []
    for page_number, page_text in page_text_map.items():
        folded_text = str(page_text or "").casefold()
        matched_terms = [term for term in terms if term.casefold() in folded_text]
        if not matched_terms:
            continue
        score = 0
        unique_matches: list[str] = []
        seen_matches: set[str] = set()
        source_hit_count = 0
        for term in matched_terms:
            key = term.casefold()
            if key in seen_matches:
                continue
            seen_matches.add(key)
            unique_matches.append(term)
            score += min(6, max(1, len(term)))
            if any(key in chunk or chunk in key for chunk in folded_source_chunks):
                source_hit_count += 1
        score += min(8, len(unique_matches) * 2)
        if source_hit_count >= 2:
            score += 6
        elif source_hit_count == 1:
            score += 2
        if any(len(term) >= 6 for term in unique_matches):
            score += 2
        ranked.append((page_number, score))

    ranked.sort(key=lambda item: (-item[1], item[0]))
    if not ranked:
        return []
    rows = await get_pages_by_indices(
        kb_id=kb_id,
        doc_id=doc_id,
        page_indices=[page_number for page_number, _ in ranked[: max(PER_SOURCE_TOP_K * 2, 8)]],
    )
    scores = {page_number: score for page_number, score in ranked}
    for row in rows:
        row["score"] = float(scores.get(int(row.get("page_index", 0)), 0))
    return rows


async def _maybe_pages_vector(
    kb_id: str, embedding: list[float] | None, doc_ids: list[str] | None,
) -> list[dict[str, Any]]:
    if not embedding:
        return []
    try:
        return await search_pages_vector(
            kb_id=kb_id, embedding=embedding, doc_ids=doc_ids, top_k=PER_SOURCE_TOP_K,
        )
    except Exception as exc:
        logger.warning("page vector search failed: %s", exc)
        return []


async def _search_excel(
    kb_id: str,
    query_tokens: list[str],
    embedding: list[float] | None,
    doc_ids: list[str] | None,
) -> list[dict[str, Any]]:
    # Excel routing uses doc_id (single), not doc_ids; we iterate.
    # In practice an Excel KB rarely has >1 file, so this is fine.
    fts_task = asyncio.gather(*[
        search_excel_policy_chunks(
            kb_id=kb_id, query_tokens=query_tokens, doc_id=did, top_k=PER_SOURCE_TOP_K,
        )
        for did in (doc_ids or [None])
    ])
    if embedding:
        vec_task = asyncio.gather(*[
            vector_search_excel_policy_chunks(
                kb_id=kb_id, embedding=embedding, doc_id=did, top_k=PER_SOURCE_TOP_K,
            )
            for did in (doc_ids or [None])
        ])
    else:
        vec_task = asyncio.gather(*[asyncio.sleep(0, result=[])])

    fts_results, vec_results = await asyncio.gather(fts_task, vec_task)
    fts_flat = [item for sub in fts_results for item in sub]
    vec_flat = [item for sub in vec_results for item in sub]
    return _rrf_merge([("fts", fts_flat), ("vector", vec_flat)], id_key="chunk_id")


async def _expand_page_neighbors(
    kb_id: str, hits: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not hits:
        return hits
    # Group by doc; for each hit's page, fetch ±1 neighbor pages.
    by_doc: dict[str, set[int]] = {}
    for hit in hits:
        doc_id = hit.get("doc_id")
        if doc_id is None:
            continue
        page_index = int(hit.get("page_index", 0))
        s = by_doc.setdefault(doc_id, set())
        s.update({page_index - 1, page_index, page_index + 1})

    extras: list[dict[str, Any]] = []
    seen_ids = {h.get("id") for h in hits}
    for doc_id, indices in by_doc.items():
        neighbor_rows = await get_pages_by_indices(
            kb_id=kb_id, doc_id=doc_id, page_indices=[i for i in indices if i >= 1],
        )
        for row in neighbor_rows:
            if row["id"] in seen_ids:
                continue
            row["score"] = row.get("score", 0)
            extras.append(row)
    return hits + extras


async def _expand_excel_neighbors(
    kb_id: str, hits: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not hits:
        return hits
    positions: list[tuple[int, int]] = []
    for hit in hits:
        pid = int(hit["policy_id"])
        idx = int(hit["chunk_index"])
        for offset in (-1, 0, 1):
            positions.append((pid, idx + offset))
    if not positions:
        return hits
    neighbor_rows = await get_excel_chunks_by_positions(
        kb_id=kb_id, positions=positions,
    )
    seen_chunk_ids = {int(h["chunk_id"]) for h in hits}
    extras = [r for r in neighbor_rows if int(r["chunk_id"]) not in seen_chunk_ids]
    return hits + extras


def _rrf_merge(
    sources: list[tuple[str, list[dict[str, Any]]]],
    *,
    id_key: str,
    k: int = RRF_K,
) -> list[dict[str, Any]]:
    scores: dict[Any, float] = {}
    merged: dict[Any, dict[str, Any]] = {}
    for source_name, hits in sources:
        for rank, hit in enumerate(hits, start=1):
            ident = hit[id_key]
            scores[ident] = scores.get(ident, 0.0) + 1.0 / (k + rank)
            if ident not in merged:
                merged[ident] = {**hit, "retrieval_sources": []}
            if source_name not in merged[ident]["retrieval_sources"]:
                merged[ident]["retrieval_sources"].append(source_name)
    ordered = sorted(scores, key=lambda i: -scores[i])
    return [merged[i] for i in ordered]


def _dedupe_hits(hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[Any] = set()
    result: list[dict[str, Any]] = []
    for hit in hits:
        ident = hit.get("id") or hit.get("chunk_id")
        if ident in seen:
            continue
        seen.add(ident)
        result.append(hit)
    return result


def _to_sources(
    page_hits: list[dict[str, Any]], excel_hits: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for hit in page_hits:
        metadata = hit.get("metadata") or {}
        display_page = metadata.get("display_page", hit.get("page_index", 0))
        sources.append({
            "text": hit.get("text", "")[:600],
            "score": float(hit.get("score", 0) or hit.get("rank", 0) or 0),
            "source_type": "text",
            "metadata": {
                "doc_id": hit.get("doc_id"),
                "page_index": display_page,
                "retrieval_sources": hit.get("retrieval_sources", []),
            },
        })
    for hit in excel_hits:
        meta = hit.get("metadata") or {}
        sources.append({
            "text": hit.get("chunk_text", "")[:600],
            "score": float(hit.get("score", 0) or hit.get("rank", 0) or 0),
            "source_type": "table",
            "metadata": {
                "doc_id": hit.get("doc_id"),
                "policy_id": hit.get("policy_id"),
                "title": hit.get("title"),
                "source_row": hit.get("source_row"),
                "policy_metadata": meta,
                "retrieval_sources": hit.get("retrieval_sources", []),
            },
        })
    return sources


# ── LLM answer streaming ─────────────────────────────────────────────

DOCUMENT_ASSISTANT_SYSTEM_PROMPT = """你是一位专业的文档分析助手，擅长从 PDF 文档中提取关键信息并给出清晰、结构化的回答。

## 回答原则

1. **结构优先**：所有回答必须分点或分节组织，禁止输出大段无结构的文字。
2. **信息密度**：每个要点只包含核心信息，不做无意义的重复或填充。
3. **语言一致**：用户用中文提问则用中文回答，用英文提问则用英文回答。

## 页码引用规范（极其重要）

### 核心规则：只使用物理页序号，绝不使用文档内部印刷页码

你将看到的每张图片上方都有一行标记，格式为 `--- 文档名 · 第 N 页 ---`。**N 就是该页的物理页序号**，即该页在 PDF 文件中的绝对位置编号。

- 引用页码时**只能**使用这个 N 值
- PDF 页面上可能印刷了其他页码（如阿拉伯数字、罗马数字），这些是文档内部的排版编号，**一律忽略**
- 文档前面可能有目录页、封面等不计入正文编号的页面，所以物理页号 N 和文档内部页码通常不一致
- 例：标记为 `--- 源文件 · 第 10 页 ---` 的页面，即使页面上印刷着"第 7 页"，引用时也必须写"第 10 页"

### 页码标注原则

- 页码是辅助信息，不是强制装饰；只有在确定页面包含实质性内容时才标注
- **宁可不标也不标错**：如果不确定物理页号，直接给出内容结论即可，不要猜测
- 识别并跳过目录页：当某页是目录结构时，不要引用该页

### 交叉引用处理

很多程序文件不会直接给出最终内容，而是写成"Refer to Attachment 1A / Appendix 4 / Section 6"。

- **引用页不是终点**：如果当前页只是说明"参见某个附件/附录/章节"，必须继续查找被引用的实际内容页
- **优先引用实际内容页**：当规则页与附件页都相关时，可以先解释规则页，但页码优先标注附件/附录的实际内容页
- **不要把清单页当证据页**：Appendix List、Attachment List、目录页只说明"有哪些内容"，不能替代被指向页面本身

## 格式选择规则

- **对比 / 多维度数据** → 使用 Markdown 表格
- **流程 / 状态流转 / 因果关系** → 使用 Mermaid 流程图（```mermaid 代码块）
- **列举 / 规范要求** → 使用有序或无序列表
- **单一直接问题** → 简短直接回答，无需强加结构

## Mermaid 使用规范

- 流程图使用 `graph TD`（从上到下）
- 节点文字保持简洁，不超过 10 个字
- 只在关系复杂、文字难以表达时才使用

## 不确定时的处理

如果文档中找不到相关信息，直接说明"文档中未找到相关内容"，不要猜测或编造。

## 回答深度要求

文档是你的信息来源，但不是你偷懒的理由。具体要求如下：

- **不允许只贴原文**：不要只复制文档原句就结束，必须在引用基础上做提炼、解释或归纳
- **不允许以"详见文档"收尾**：所有信息必须直接在回答中呈现，用户不应该需要自己去翻文档
- **主动补充上下文**：如果某条规定有前提条件、例外情况或关联条款，必须一并说明，不能只答用户问到的那一句
- **数字和条件要完整**：涉及数值、时限、比例、阈值时，必须把所有相关的数字全部列出，不能只说"有相关规定"
- **多处信息要汇总**：如果文档多个地方都有相关内容，必须整合后统一回答，不能只引用一处

## 回答长度标准

- 简单事实性问题：2-5 句话，直接给结论
- 流程类 / 规范类问题：完整列出所有步骤和条件，宁可详细也不能遗漏
- 对比类问题：必须用表格，每个维度都要填满，不留空白格"""


HYBRID_RETRIEVAL_PROMPT_APPENDIX = """

## 全局双路检索使用规则

你可能同时看到两类候选证据：

- **PDF 页面图片**：通常来自程序文件、规范、附件、图表、扫描件，适合回答文件内容、Attachment / Appendix / Section、流程、翻译、表格或页面细节问题。
- **Excel 政策片段**：通常来自结构化政策库，适合回答申报、补贴、奖励、园区、企业条件、认定条件等政策问题。

这些证据都是候选材料，不代表都和问题相关。回答前必须先判断用户问题实际需要哪类来源：

1. 如果问题明确提到文件名、附件名、页码、Attachment、Appendix、Section，或要求翻译某段内容，优先使用对应 PDF 页面；Excel 只在直接补充同一问题时使用。
2. 如果问题明显是在问政策、申报、补贴、奖励、园区、企业条件或认定条件，优先使用 Excel 政策片段；PDF 只在直接补充同一问题时使用。
3. 如果 PDF 和 Excel 证据主题不一致，忽略不相关来源，不要为了覆盖来源而强行混合。
4. 回答中按来源标注依据：PDF 写"文件名 第 N 页"；Excel 写政策标题、发文字号或来源行。
5. 如果候选材料不足以支持答案，明确说明未找到依据，不要猜测。"""


def _select_pages_for_answer(
    page_hits: list[dict[str, Any]],
) -> list[tuple[str, int]]:
    """Pick up to MULTI_DOC_TOTAL_PAGE_BUDGET (doc_id, page) pairs, with a
    per-doc cap. Multi-doc cap is tighter so the model can see breadth across
    docs rather than all pages from one.
    """
    if not page_hits:
        return []
    by_doc: dict[str, list[int]] = {}
    for hit in page_hits:
        doc_id = hit.get("doc_id")
        if not doc_id:
            continue
        page = int(hit.get("page_index", 0))
        if page < 1:
            continue
        pages = by_doc.setdefault(doc_id, [])
        if page not in pages:
            pages.append(page)
    if not by_doc:
        return []
    multi = len(by_doc) > 1
    per_doc_limit = MULTI_DOC_PER_DOC_PAGE_LIMIT if multi else MULTI_DOC_SINGLE_DOC_PAGE_LIMIT
    total_budget = max(MULTI_DOC_TOTAL_PAGE_BUDGET, per_doc_limit)
    ordered_docs = sorted(by_doc, key=lambda d: -len(by_doc[d]))
    selected: list[tuple[str, int]] = []
    for doc_id in ordered_docs:
        for page in sorted(by_doc[doc_id])[:per_doc_limit]:
            selected.append((doc_id, page))
            if len(selected) >= total_budget:
                return selected
    return selected


def _build_excel_text_block(excel_hits: list[dict[str, Any]]) -> str:
    if not excel_hits:
        return ""
    blocks: list[str] = ["【Excel 政策片段】"]
    for i, hit in enumerate(excel_hits, start=1):
        title = hit.get("title") or "（未命名）"
        row = hit.get("source_row")
        text = (hit.get("chunk_text") or "").strip()
        meta = hit.get("metadata") or {}
        meta_lines: list[str] = []
        for key, value in meta.items():
            if value in (None, "", []):
                continue
            meta_lines.append(f"{key}: {value}")
        meta_str = ("\n" + "\n".join(meta_lines)) if meta_lines else ""
        blocks.append(
            f"片段{i}：政策《{title}》（来源行 {row}）{meta_str}\n{text}"
        )
    return "\n\n".join(blocks)


async def _build_multimodal_user_message(
    *,
    kb_id: str,
    question: str,
    page_hits: list[dict[str, Any]],
    excel_hits: list[dict[str, Any]],
) -> tuple[dict[str, Any], int]:
    """Construct the multimodal user message with page images + Excel text.

    Mirrors llm-rag's build_document_user_message + merge_excel_context.
    Returns (message, image_page_count).
    """
    selected_pages = _select_pages_for_answer(page_hits)
    doc_ids = sorted({doc_id for doc_id, _ in selected_pages})
    profile_map = await get_doc_profiles_bulk(kb_id=kb_id, doc_ids=doc_ids) if doc_ids else {}

    content: list[dict[str, Any]] = []

    if selected_pages:
        intro = (
            ("你将看到多个 PDF 的页面图片。这些页面来自系统为当前问题召回出的候选文档。"
             if len(doc_ids) > 1
             else "你将看到同一个 PDF 的页面图片。这是当前会话需要参考的文档。")
            + "请基于这些页面回答问题。"
            "如果答案依赖具体页面，请尽量注明页码。"
            "若信息不足，请明确说明缺少哪部分。"
            "\n\n"
            "**页码说明**：每条 '--- 文档名 · 第 N 页 ---' 中的 N 是该页在 PDF 文件中的物理页序号。"
            "引用页码时必须使用这个物理页号 N，不要使用文档内部印刷的页码数字。"
        )
        content.append({"type": "text", "text": intro})

        # Optional per-doc chapter summary block (helps locate answers across docs).
        summary_lines: list[str] = []
        for doc_id in doc_ids:
            profile = profile_map.get(doc_id) or {}
            summary = (profile.get("chapter_summary") or "").strip()
            if not summary:
                continue
            display_name = profile.get("file_name") or doc_id
            summary_lines.append(f"▶ {display_name}\n{summary}")
        if summary_lines:
            header = "【文档内容分布参考】\n（以下为各文档的页码范围摘要，供你定位答案所在页面，实际内容以下方页面图片为准）"
            content.append({"type": "text", "text": header + "\n\n" + "\n\n".join(summary_lines)})

        # Load and append the actual page images.
        for doc_id in doc_ids:
            page_numbers = [p for d, p in selected_pages if d == doc_id]
            if not page_numbers:
                continue
            render_dir = render_dir_for(kb_id, doc_id)
            loaded = await asyncio.to_thread(
                load_selected_page_data_urls,
                render_dir,
                page_numbers,
                max_pixels=LLM_RENDER_MAX_PIXELS,
                jpeg_quality=LLM_RENDER_JPEG_QUALITY,
            )
            if not loaded:
                continue
            profile = profile_map.get(doc_id) or {}
            display_name = profile.get("file_name") or doc_id
            for page_num, data_url in loaded:
                content.append({"type": "text", "text": f"--- {display_name} · 第 {page_num} 页 ---"})
                content.append({
                    "type": "image_url",
                    "image_url": {"url": data_url},
                })

    excel_block = _build_excel_text_block(excel_hits)
    if excel_block:
        content.append({"type": "text", "text": excel_block})

    content.append({"type": "text", "text": f"用户问题：{question}"})

    image_count = sum(1 for item in content if item.get("type") == "image_url")
    return {"role": "user", "content": content}, image_count


def _extract_response_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
            elif hasattr(item, "text"):
                parts.append(str(getattr(item, "text") or ""))
        return "".join(parts)
    if isinstance(value, dict):
        return str(value.get("text") or value.get("content") or "")
    return ""


def _extract_delta_text(delta: Any) -> str:
    if delta is None:
        return ""

    content_text = _extract_response_text(getattr(delta, "content", None))
    if content_text:
        return content_text

    model_extra = getattr(delta, "model_extra", None)
    if isinstance(model_extra, dict):
        return _extract_response_text(model_extra.get("content"))

    return ""


def _extract_delta_reasoning(delta: Any) -> str:
    if delta is None:
        return ""

    candidates = [
        getattr(delta, "reasoning_content", None),
        getattr(delta, "reasoning", None),
        getattr(delta, "thinking", None),
        getattr(delta, "reasoning_text", None),
    ]

    model_extra = getattr(delta, "model_extra", None)
    if isinstance(model_extra, dict):
        candidates.extend(
            [
                model_extra.get("reasoning_content"),
                model_extra.get("reasoning"),
                model_extra.get("thinking"),
                model_extra.get("reasoning_text"),
            ]
        )

    for candidate in candidates:
        text = _extract_response_text(candidate)
        if text:
            return text

    return ""


async def _stream_llm_events(
    *,
    kb_id: str,
    question: str,
    page_hits: list[dict[str, Any]],
    excel_hits: list[dict[str, Any]],
    creds: RequestCredentials,
    enable_thinking: bool,
) -> AsyncIterator[dict[str, str]]:
    client = build_llm_client(creds)
    model = creds.llm_model or "qwen-vl-max"

    user_message, image_count = await _build_multimodal_user_message(
        kb_id=kb_id,
        question=question,
        page_hits=page_hits,
        excel_hits=excel_hits,
    )
    has_pdf = image_count > 0
    has_excel = bool(excel_hits)
    system_prompt = DOCUMENT_ASSISTANT_SYSTEM_PROMPT
    if has_pdf and has_excel:
        system_prompt = DOCUMENT_ASSISTANT_SYSTEM_PROMPT + HYBRID_RETRIEVAL_PROMPT_APPENDIX

    logger.info(
        "[answer.request] kb_id=%s question=%r pdf_pages=%s excel_chunks=%s model=%s",
        kb_id,
        _preview_text(question),
        image_count,
        len(excel_hits),
        model,
    )

    def _stream():
        return client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                user_message,
            ],
            stream=True,
            stream_options={"include_usage": True},
            temperature=0,
            extra_body={"enable_thinking": enable_thinking},
        )

    # OpenAI Python client is sync; drain it in a worker while the async
    # endpoint yields deltas as they arrive.
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, str] | None] = asyncio.Queue()

    def _producer():
        try:
            for ev in _stream():
                if not ev.choices:
                    continue
                delta = ev.choices[0].delta
                reasoning = _extract_delta_reasoning(delta)
                if reasoning:
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        {"type": "reasoning", "text": reasoning},
                    )
                answer = _extract_delta_text(delta)
                if answer:
                    loop.call_soon_threadsafe(
                        queue.put_nowait,
                        {"type": "text", "text": answer},
                    )
        except Exception as exc:
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {"type": "error", "text": str(exc)},
            )
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    producer_future = loop.run_in_executor(None, _producer)
    while True:
        event = await queue.get()
        if event is None:
            break
        if event["type"] == "error":
            raise RuntimeError(event["text"])
        yield event
    await producer_future


def _sse(event: str, data: dict) -> bytes:
    body = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {body}\n\n".encode("utf-8")
