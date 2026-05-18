"""
Query module — hybrid retrieval + optional streaming LLM answer.

Backed by app.retrieval which does FTS + vector + RRF over the
Postgres-native RAG store. This replaces the LlamaIndex QueryBackend.

SSE event shape (kept compatible with the prior contract so the Next.js
side does not need to change):
    event: progress | retrieval | chunk | reasoning | error | done
"""

from __future__ import annotations

import json
import logging
import time
from typing import AsyncIterator

from app.config import RequestCredentials
from app.models import QueryRequest, QueryResponse, RetrievalResult
from app.retrieval import (
    _retrieve_internal,
    _stream_llm_events,
    _to_sources,
    suggest_default_queries,
)

logger = logging.getLogger(__name__)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ── Public ───────────────────────────────────────────────────────────

async def query_knowledge_base(
    req: QueryRequest, creds: RequestCredentials
) -> QueryResponse:
    """Synchronous query — retrieval + optional LLM answer (collected)."""
    page_hits, excel_hits = await _retrieve_internal(
        kb_id=req.kb_id, question=req.question, creds=creds,
    )
    sources_raw = _to_sources(page_hits, excel_hits)[: req.top_k]
    sources = [
        RetrievalResult(
            text=s.get("text", ""),
            score=float(s.get("score", 0)),
            source_type=s.get("source_type", "text"),
            metadata=s.get("metadata", {}) or {},
        )
        for s in sources_raw
    ]

    answer = ""
    if req.generate_answer and (page_hits or excel_hits):
        try:
            collected: list[str] = []
            async for event in _stream_llm_events(
                kb_id=req.kb_id,
                question=req.question,
                page_hits=page_hits,
                excel_hits=excel_hits,
                creds=creds,
                enable_thinking=False,
            ):
                if event.get("type") == "text":
                    collected.append(event.get("text", ""))
            answer = "".join(collected)
        except Exception as exc:
            logger.exception("non-stream answer failed")
            answer = f"[Error generating answer: {exc}]"

    return QueryResponse(
        answer=answer, reasoning="", sources=sources, assets=[],
    )


async def stream_query(
    req: QueryRequest, creds: RequestCredentials
) -> AsyncIterator[str]:
    """SSE stream — retrieval + streaming LLM answer."""
    try:
        yield _sse("progress", {
            "stage": "正在检索 OCR 索引",
            "detail": "正在执行文档路由、全文检索、向量检索和邻页扩展。",
        })
        page_hits, excel_hits = await _retrieve_internal(
            kb_id=req.kb_id, question=req.question, creds=creds,
        )
        sources_raw = _to_sources(page_hits, excel_hits)[: req.top_k]
    except Exception as exc:
        logger.exception("retrieval failed for kb=%s", req.kb_id)
        yield _sse("retrieval", {
            "sources": [], "retrieval_error": str(exc),
            "answer_assets": [], "answer_sources": [],
        })
        yield _sse("error", {"message": str(exc)})
        yield _sse("done", {"answer": "", "answer_assets": [], "answer_sources": []})
        return

    yield _sse("retrieval", {
        "sources": sources_raw,
        "retrieval_error": "",
        "answer_assets": [],
        "answer_sources": sources_raw,
    })
    yield _sse("progress", {
        "stage": "正在整理文档上下文",
        "detail": f"已选出 {len(sources_raw)} 条候选片段。",
    })

    if not req.generate_answer or (not page_hits and not excel_hits):
        yield _sse("done", {"answer": "", "sources_count": len(sources_raw)})
        return

    answer_text = ""
    reasoning_text = ""
    t0 = time.perf_counter()
    try:
        yield _sse("progress", {
            "stage": "正在调用模型服务",
            "detail": "已建立检索上下文，正在等待模型返回思考过程或回答正文。",
        })
        async for event in _stream_llm_events(
            kb_id=req.kb_id,
            question=req.question,
            page_hits=page_hits,
            excel_hits=excel_hits,
            creds=creds,
            enable_thinking=req.enable_thinking,
        ):
            delta = event["text"]
            if event["type"] == "reasoning":
                reasoning_text += delta
                yield _sse("reasoning", {"delta": delta})
            elif event["type"] == "text":
                answer_text += delta
                yield _sse("chunk", {"text": delta})
    except Exception as exc:
        logger.exception("answer streaming failed")
        yield _sse("error", {"message": str(exc)})

    logger.info(
        "[stream] %.0fms answer=%d chars",
        (time.perf_counter() - t0) * 1000, len(answer_text),
    )
    yield _sse("done", {
        "answer": answer_text,
        "reasoning": reasoning_text,
        "answer_assets": [],
        "answer_sources": sources_raw,
        "sources_count": len(sources_raw),
    })


async def get_default_queries(
    kb_id: str, creds: RequestCredentials  # noqa: ARG001 — creds reserved
) -> list[str]:
    """Suggested queries — derived from accumulated doc keywords."""
    queries = await suggest_default_queries(kb_id=kb_id, limit=5)
    if queries:
        return queries
    return [
        "这个知识库主要讲了什么？",
        "请总结核心要点",
        "有哪些关键结论？",
    ]
