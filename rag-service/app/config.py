import os
from dataclasses import dataclass, field


@dataclass
class RagCredentials:
    """Per-request credentials passed via HTTP headers from the Next.js backend."""

    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    embedding_api_key: str = ""
    embedding_base_url: str = ""
    embedding_model: str = ""
    rerank_enabled: bool = False
    rerank_api_key: str = ""
    rerank_base_url: str = ""
    rerank_model: str = ""


DATABASE_URL: str = os.environ.get("DATABASE_URL", "")
RAG_SERVICE_SECRET: str = os.environ.get("RAG_SERVICE_SECRET", "")


def get_credentials_from_headers(headers: dict) -> RagCredentials:
    """Extract model credentials from request headers."""
    return RagCredentials(
        llm_api_key=headers.get("x-llm-api-key", ""),
        llm_base_url=headers.get("x-llm-base-url", ""),
        llm_model=headers.get("x-llm-model", ""),
        embedding_api_key=headers.get("x-embedding-api-key", ""),
        embedding_base_url=headers.get("x-embedding-base-url", ""),
        embedding_model=headers.get("x-embedding-model", ""),
        rerank_enabled=headers.get("x-rerank-enabled", "false").lower() == "true",
        rerank_api_key=headers.get("x-rerank-api-key", ""),
        rerank_base_url=headers.get("x-rerank-base-url", ""),
        rerank_model=headers.get("x-rerank-model", ""),
    )
