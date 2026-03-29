from __future__ import annotations

import logging
from typing import Any

import requests
from llama_index.core.bridge.pydantic import Field
from llama_index.core.postprocessor.types import BaseNodePostprocessor
from llama_index.core.schema import QueryBundle


LOGGER = logging.getLogger(__name__)
RETRIEVAL_KEYS = ("text_results", "image_results", "table_results")


def _extract_node_text(node: Any) -> str:
    metadata = getattr(node, "metadata", {}) or {}

    if metadata.get("type") == "image_description":
        return (
            metadata.get("detailed_description")
            or metadata.get("summary")
            or getattr(node, "text", "")
            or ""
        ).strip()

    if metadata.get("type") == "table_block" or metadata.get("table_id"):
        return (
            metadata.get("semantic_summary")
            or metadata.get("normalized_table_text")
            or getattr(node, "text", "")
            or metadata.get("summary")
            or metadata.get("caption")
            or metadata.get("raw_table")
            or ""
        ).strip()

    return (
        getattr(node, "text", "")
        or metadata.get("summary")
        or metadata.get("caption")
        or ""
    ).strip()


class Reranker:
    def __init__(
        self,
        api_key: str,
        api_base: str,
        model_name: str,
        *,
        top_n: int = 5,
        timeout: float = 20,
        session: requests.Session | None = None,
    ) -> None:
        self.api_key = (api_key or "").strip()
        self.api_base = (api_base or "").rstrip("/")
        self.model_name = model_name
        self.top_n = top_n
        self.timeout = timeout
        self.session = session or requests.Session()

    @property
    def enabled(self) -> bool:
        return bool(self.api_key and self.api_base and self.model_name)

    def rerank(self, query: str, nodes: list[Any], top_n: int | None = None) -> list[Any]:
        if not self.enabled or not query or len(nodes) <= 1:
            return nodes

        requested_top_n = min(top_n or self.top_n, len(nodes))
        documents = [_extract_node_text(node) for node in nodes]

        if not any(documents):
            return nodes[:requested_top_n]

        try:
            response = self.session.post(
                f"{self.api_base}/rerank",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model_name,
                    "query": query,
                    "documents": documents,
                    "top_n": requested_top_n,
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            LOGGER.warning("Rerank failed, fallback to original order: %s", exc)
            return nodes[:requested_top_n]

        results = payload.get("results") or []
        if not results:
            return nodes[:requested_top_n]

        reranked: list[Any] = []
        seen_indices: set[int] = set()
        for item in results:
            index = item.get("index")
            if not isinstance(index, int) or index < 0 or index >= len(nodes):
                continue
            node = nodes[index]
            relevance_score = item.get("relevance_score")
            if relevance_score is not None:
                try:
                    node.score = float(relevance_score)
                except (TypeError, ValueError):
                    pass
            reranked.append(node)
            seen_indices.add(index)

        if not reranked:
            return nodes[:requested_top_n]

        if len(reranked) < requested_top_n:
            for index, node in enumerate(nodes):
                if index in seen_indices:
                    continue
                reranked.append(node)
                if len(reranked) >= requested_top_n:
                    break

        return reranked[:requested_top_n]


def rerank_retrieval_bundle(
    query: str,
    retrieval: dict[str, list[Any]],
    reranker: Reranker | Any | None,
    *,
    top_n_map: dict[str, int] | None = None,
) -> dict[str, list[Any]]:
    if reranker is None:
        return retrieval

    reranked: dict[str, list[Any]] = {}
    for key in RETRIEVAL_KEYS:
        nodes = retrieval.get(key, [])
        reranked[key] = reranker.rerank(
            query,
            nodes,
            top_n=(top_n_map or {}).get(key),
        )
    return reranked


class RerankPostprocessor(BaseNodePostprocessor):
    reranker: Reranker = Field(exclude=True)
    top_n: int = Field(default=5)

    @classmethod
    def class_name(cls) -> str:
        return "RerankPostprocessor"

    def _postprocess_nodes(
        self,
        nodes: list[Any],
        query_bundle: QueryBundle | None = None,
    ) -> list[Any]:
        if query_bundle is None:
            return nodes[: self.top_n]
        return self.reranker.rerank(query_bundle.query_str, nodes, top_n=self.top_n)
