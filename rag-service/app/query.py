"""
Query module — retrieval, reranking, and LLM answer generation.

Uses the QueryBackend from step4_basic_query for the full pipeline
(multi-collection retrieval, query expansion, reranking, filtering,
LLM streaming/non-streaming answer).
"""

import json
import logging
import time
from typing import Any, AsyncIterator

from app.config import RequestCredentials
from app.models import QueryRequest, QueryResponse, RetrievalResult
from app.step4_basic_query import QueryBackend, _safe_score, _sort_answer_assets
from app.web_helpers import serialize_scored_node, ARTIFACTS_ROOT

logger = logging.getLogger(__name__)


def _serialize_node(node: Any) -> dict[str, Any]:
    """Serialize a LlamaIndex node using web_helpers for proper artifact URLs."""
    return serialize_scored_node(node, artifacts_root=ARTIFACTS_ROOT)


def _serialize_nodes(nodes: list[Any]) -> list[dict[str, Any]]:
    return [_serialize_node(n) for n in nodes]


def _make_backend(creds: RequestCredentials, kb_id: str) -> QueryBackend:
    # DashScope SDK requires DASHSCOPE_API_KEY env var; OpenAI SDK uses OPENAI_API_KEY.
    # Set them every request since credentials come from per-request headers.
    import os
    if creds.embedding_api_key:
        os.environ["DASHSCOPE_API_KEY"] = creds.embedding_api_key
    if creds.llm_api_key:
        os.environ["OPENAI_API_KEY"] = creds.llm_api_key
        if not os.environ.get("DASHSCOPE_API_KEY"):
            os.environ["DASHSCOPE_API_KEY"] = creds.llm_api_key
    return QueryBackend(creds=creds, kb_id=kb_id)


async def query_knowledge_base(
    req: QueryRequest, creds: RequestCredentials
) -> QueryResponse:
    """Synchronous query -- returns full result with retrieval + LLM answer."""
    backend = _make_backend(creds, req.kb_id)

    retrieval = backend.retrieve(req.question)

    sources = []
    for branch_key in ("text_results", "image_results", "table_results"):
        for node in retrieval.get(branch_key, []):
            sources.append(
                RetrievalResult(
                    text=str(getattr(node, "text", "") or ""),
                    score=_safe_score(node),
                    source_type=(getattr(node, "metadata", {}) or {}).get(
                        "type", "text"
                    ),
                    metadata=getattr(node, "metadata", {}) or {},
                )
            )

    answer = ""
    reasoning = ""
    assets: list[dict] = []

    if req.generate_answer and sources:
        try:
            answer_result = backend.answer(req.question, retrieval=retrieval)
            answer = answer_result.get("answer", "")
            assets = _serialize_nodes(answer_result.get("answer_assets", []))
        except Exception as exc:
            logger.exception("Answer generation failed")
            answer = f"[Error generating answer: {exc}]"

    return QueryResponse(
        answer=answer,
        reasoning=reasoning,
        sources=sources,
        assets=assets,
    )


async def stream_query(
    req: QueryRequest, creds: RequestCredentials
) -> AsyncIterator[str]:
    """
    SSE streaming query.

    Event flow:
        1. ``retrieval`` — sources + answer_assets + answer_sources
        2. ``reasoning`` — reasoning deltas (if model supports it)
        3. ``chunk``     — answer text deltas
        4. ``done``      — final answer + assets
        5. ``error``     — on failure
    """
    def sse_event(event_type: str, data: dict) -> str:
        return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    try:
        backend = _make_backend(creds, req.kb_id)

        # Step 1: Retrieval
        retrieval_error = ""
        retrieval = None
        try:
            retrieval = backend.retrieve(req.question)
        except Exception as exc:
            logger.exception("Retrieval failed for kb=%s", req.kb_id)
            retrieval_error = str(exc)

        if retrieval_error or retrieval is None:
            yield sse_event("retrieval", {
                "sources": [],
                "retrieval_error": retrieval_error,
                "answer_assets": [],
                "answer_sources": [],
            })
            yield sse_event("error", {"message": retrieval_error or "Retrieval failed"})
            yield sse_event("done", {"answer": "", "answer_assets": [], "answer_sources": []})
            return

        # Serialize retrieval sources
        sources = []
        for branch_key in ("text_results", "image_results", "table_results"):
            sources.extend(_serialize_nodes(retrieval.get(branch_key, [])))

        if not req.generate_answer or not sources:
            yield sse_event("retrieval", {
                "sources": sources,
                "retrieval_error": "",
                "answer_assets": [],
                "answer_sources": [],
            })
            yield sse_event("done", {"answer": "", "sources_count": len(sources)})
            return

        # Step 2: Streaming answer
        try:
            stream_result = backend.stream_answer(req.question, retrieval=retrieval)
        except Exception as exc:
            yield sse_event("retrieval", {
                "sources": sources,
                "retrieval_error": "",
                "answer_assets": [],
                "answer_sources": [],
            })
            yield sse_event("error", {"message": str(exc)})
            yield sse_event("done", {"answer": "", "answer_assets": [], "answer_sources": []})
            return

        stream_iter = stream_result.get("stream", [])
        raw_answer_sources = stream_result.get("answer_sources", [])
        raw_answer_assets = stream_result.get("answer_assets", [])

        answer_sources = _serialize_nodes(raw_answer_sources)
        answer_assets = _serialize_nodes(_sort_answer_assets(raw_answer_assets))

        yield sse_event("retrieval", {
            "sources": sources,
            "retrieval_error": "",
            "answer_assets": answer_assets,
            "answer_sources": answer_sources,
        })

        # Stream LLM chunks
        answer_text = ""
        t_start = time.perf_counter()
        try:
            for chunk in stream_iter:
                additional_kwargs = getattr(chunk, "additional_kwargs", {}) or {}
                reasoning_delta = str(additional_kwargs.get("reasoning_delta", "") or "")
                delta = getattr(chunk, "delta", "") or getattr(chunk, "text", "")
                if not delta and isinstance(chunk, str):
                    delta = chunk
                if not reasoning_delta and not delta:
                    continue
                if reasoning_delta:
                    yield sse_event("reasoning", {"delta": reasoning_delta})
                if delta:
                    answer_text += delta
                    yield sse_event("chunk", {"text": delta})
        except Exception as exc:
            yield sse_event("error", {"message": str(exc)})

        logger.info(
            "[stream] %.0fms answer=%d chars",
            (time.perf_counter() - t_start) * 1000,
            len(answer_text),
        )

        yield sse_event("done", {
            "answer": answer_text,
            "answer_assets": answer_assets,
            "answer_sources": answer_sources,
            "sources_count": len(sources),
        })

    except Exception as e:
        logger.exception("stream_query failed")
        yield sse_event("error", {"message": str(e)})


async def get_default_queries(
    kb_id: str, creds: RequestCredentials
) -> list[str]:
    """Return suggested queries for a knowledge base."""
    return [
        "What are the main topics covered?",
        "Summarize the key points",
        "What are the most important findings?",
    ]
