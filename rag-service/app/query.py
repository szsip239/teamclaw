import json
import logging
from typing import AsyncIterator
from urllib.parse import urlparse

from app.config import DATABASE_URL, RagCredentials
from app.models import QueryRequest, QueryResponse, RetrievalResult

logger = logging.getLogger(__name__)


def _build_vector_store():
    """Build PGVectorStore connection."""
    from llama_index.vector_stores.postgres import PGVectorStore

    parsed = urlparse(DATABASE_URL)

    return PGVectorStore.from_params(
        database=parsed.path.lstrip("/").split("?")[0],
        host=parsed.hostname or "localhost",
        port=str(parsed.port or 5432),
        user=parsed.username or "teamclaw",
        password=parsed.password or "",
        table_name="data_text_chunks",
        schema_name="rag",
        embed_dim=1024,
    )


def _build_embed_model(creds: RagCredentials):
    from llama_index.embeddings.openai import OpenAIEmbedding

    return OpenAIEmbedding(
        api_key=creds.embedding_api_key,
        api_base=creds.embedding_base_url,
        model_name=creds.embedding_model,
    )


_SYSTEM_PROMPT = (
    "You are a helpful assistant. Answer questions based on the provided context. "
    "If the context doesn't contain enough information, say so. "
    "Always cite which parts of the context support your answer."
)


async def query_knowledge_base(
    req: QueryRequest, creds: RagCredentials
) -> QueryResponse:
    """Synchronous query -- returns full result."""
    from llama_index.core import VectorStoreIndex
    from llama_index.core.vector_stores.types import (
        MetadataFilter,
        MetadataFilters,
    )

    vector_store = _build_vector_store()
    embed_model = _build_embed_model(creds)

    index = VectorStoreIndex.from_vector_store(
        vector_store=vector_store,
        embed_model=embed_model,
    )

    filters = MetadataFilters(
        filters=[
            MetadataFilter(key="kb_id", value=req.kb_id),
        ]
    )

    retriever = index.as_retriever(
        similarity_top_k=req.top_k,
        filters=filters,
    )

    nodes = await retriever.aretrieve(req.question)

    sources = [
        RetrievalResult(
            text=node.get_text(),
            score=node.get_score() or 0.0,
            source_type=node.metadata.get("source_type", "text"),
            metadata=node.metadata,
        )
        for node in nodes
    ]

    answer = ""
    reasoning = ""

    if req.generate_answer and sources:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=creds.llm_api_key,
            base_url=creds.llm_base_url,
        )

        context = "\n\n---\n\n".join([s.text for s in sources[:5]])
        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {req.question}",
            },
        ]

        response = await client.chat.completions.create(
            model=creds.llm_model,
            messages=messages,
        )
        answer = response.choices[0].message.content or ""

    return QueryResponse(
        answer=answer,
        reasoning=reasoning,
        sources=sources,
    )


async def stream_query(
    req: QueryRequest, creds: RagCredentials
) -> AsyncIterator[str]:
    """SSE streaming query -- yields event strings."""
    from llama_index.core import VectorStoreIndex
    from llama_index.core.vector_stores.types import (
        MetadataFilter,
        MetadataFilters,
    )

    def sse_event(event_type: str, data: dict) -> str:
        return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

    try:
        vector_store = _build_vector_store()
        embed_model = _build_embed_model(creds)

        index = VectorStoreIndex.from_vector_store(
            vector_store=vector_store,
            embed_model=embed_model,
        )

        filters = MetadataFilters(
            filters=[
                MetadataFilter(key="kb_id", value=req.kb_id),
            ]
        )

        retriever = index.as_retriever(
            similarity_top_k=req.top_k,
            filters=filters,
        )

        # Step 1: Retrieval
        nodes = await retriever.aretrieve(req.question)

        sources = [
            {
                "text": node.get_text(),
                "score": node.get_score() or 0.0,
                "source_type": node.metadata.get("source_type", "text"),
                "metadata": node.metadata,
            }
            for node in nodes
        ]

        yield sse_event("retrieval", {"sources": sources})

        if not req.generate_answer or not sources:
            yield sse_event("done", {"sources_count": len(sources)})
            return

        # Step 2: LLM streaming answer
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=creds.llm_api_key,
            base_url=creds.llm_base_url,
        )

        context = "\n\n---\n\n".join([s["text"] for s in sources[:5]])
        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {req.question}",
            },
        ]

        stream = await client.chat.completions.create(
            model=creds.llm_model,
            messages=messages,
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield sse_event(
                    "chunk", {"text": chunk.choices[0].delta.content}
                )

        yield sse_event("done", {"sources_count": len(sources)})

    except Exception as e:
        logger.exception("stream_query failed")
        yield sse_event("error", {"message": str(e)})


async def get_default_queries(
    kb_id: str, creds: RagCredentials
) -> list[str]:
    """Generate suggested queries based on KB content.

    Simple implementation returning generic suggestions.
    Could be enhanced to sample from actual content.
    """
    return [
        "What are the main topics covered?",
        "Summarize the key points",
        "What are the most important findings?",
    ]
