"""
Embedding + LLM client adapters.

Wraps OpenAI-compatible HTTP APIs (DashScope, SiliconFlow, OpenAI, etc.)
using per-request credentials carried in request headers. There is no
client caching — each call constructs an OpenAI client because the
target endpoint/key differs per request.
"""

from __future__ import annotations

import logging
import os
from typing import Iterable

from openai import OpenAI

from app.config import PGVECTOR_EMBED_DIM, RequestCredentials

logger = logging.getLogger(__name__)

EMBED_BATCH_SIZE = min(
    max(1, int(os.environ.get("SILICONFLOW_EMBEDDING_BATCH_SIZE", "10"))),
    10,
)


def build_llm_client(creds: RequestCredentials) -> OpenAI:
    if not creds.llm_api_key:
        raise RuntimeError("LLM API key missing — set x-llm-api-key header")
    return OpenAI(
        api_key=creds.llm_api_key,
        base_url=creds.llm_base_url or None,
    )


def build_embedding_client(creds: RequestCredentials) -> OpenAI:
    if not creds.embedding_api_key:
        raise RuntimeError("Embedding API key missing — set x-embedding-api-key header")
    return OpenAI(
        api_key=creds.embedding_api_key,
        base_url=creds.embedding_base_url or None,
    )


def encode_texts(creds: RequestCredentials, texts: list[str]) -> list[list[float]]:
    """Embed `texts` in batches. Returns a list of vectors of length len(texts)."""
    if not texts:
        return []
    client = build_embedding_client(creds)
    model = creds.embedding_model or "text-embedding-v3"
    out: list[list[float]] = []
    for batch in _batched(texts, EMBED_BATCH_SIZE):
        resp = client.embeddings.create(model=model, input=list(batch))
        for item in resp.data:
            vec = list(item.embedding)
            if len(vec) != PGVECTOR_EMBED_DIM:
                raise RuntimeError(
                    f"Embedding dim mismatch: model {model} returned {len(vec)}, "
                    f"schema expects {PGVECTOR_EMBED_DIM}. Set PGVECTOR_EMBED_DIM "
                    f"to match the embedding model, then drop+recreate rag tables."
                )
            out.append(vec)
    return out


def _batched(items: list[str], size: int) -> Iterable[list[str]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]
