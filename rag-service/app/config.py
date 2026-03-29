"""
============================================================
TeamClaw RAG Service — Unified Configuration
============================================================
Per-request credentials (API keys, model names) come from HTTP headers.
Container-level settings (DATABASE_URL, paths, retrieval params) come from
environment variables.
============================================================
"""

import os
from dataclasses import dataclass, field


# ============================================================
# Per-request credentials (populated from HTTP headers)
# ============================================================

@dataclass
class RequestCredentials:
    """Per-request credentials extracted from HTTP headers."""

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

    ocr_model: str = "qwen3.5-plus"
    ocr_workers: int = 4


def get_credentials_from_headers(headers: dict) -> RequestCredentials:
    """Extract model credentials from request headers."""
    rerank_enabled_raw = headers.get("x-rerank-enabled", "false")
    rerank_enabled = rerank_enabled_raw.lower() not in {"0", "false", "no", ""}

    ocr_workers_raw = headers.get("x-ocr-workers", "4")
    try:
        ocr_workers = max(1, min(int(ocr_workers_raw), 12))
    except (ValueError, TypeError):
        ocr_workers = 4

    return RequestCredentials(
        llm_api_key=headers.get("x-llm-api-key", ""),
        llm_base_url=headers.get("x-llm-base-url", ""),
        llm_model=headers.get("x-llm-model", ""),
        embedding_api_key=headers.get("x-embedding-api-key", ""),
        embedding_base_url=headers.get("x-embedding-base-url", ""),
        embedding_model=headers.get("x-embedding-model", ""),
        rerank_enabled=rerank_enabled,
        rerank_api_key=headers.get("x-rerank-api-key", ""),
        rerank_base_url=headers.get("x-rerank-base-url", ""),
        rerank_model=headers.get("x-rerank-model", ""),
        ocr_model=headers.get("x-ocr-model", "qwen3.5-plus"),
        ocr_workers=ocr_workers,
    )


# ============================================================
# Container-level settings (env vars)
# ============================================================

DATABASE_URL: str = os.environ.get("DATABASE_URL", "")
RAG_SERVICE_SECRET: str = os.environ.get("RAG_SERVICE_SECRET", "")

# Ingestion output root — where OCR artifacts land
INGESTION_OUTPUT_ROOT: str = os.environ.get(
    "INGESTION_OUTPUT_ROOT",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ingestion_output"),
)

# PGVector table names (under "rag" schema or public)
PGVECTOR_SCHEMA: str = os.environ.get("PGVECTOR_SCHEMA", "public")
PGVECTOR_TEXT_TABLE: str = "text_chunks"
PGVECTOR_IMAGE_TABLE: str = "image_descriptions"
PGVECTOR_TABLE_TABLE: str = "table_blocks"

PGVECTOR_EMBED_DIM: int = int(os.environ.get("PGVECTOR_EMBED_DIM", "1536"))


# ============================================================
# Retrieval parameters
# ============================================================

TEXT_SIMILARITY_TOP_K: int = int(os.environ.get("TEXT_SIMILARITY_TOP_K", "5"))
IMAGE_SIMILARITY_TOP_K: int = int(os.environ.get("IMAGE_SIMILARITY_TOP_K", "3"))
TABLE_SIMILARITY_TOP_K: int = int(os.environ.get("TABLE_SIMILARITY_TOP_K", "3"))

TEXT_RETRIEVAL_SCORE_THRESHOLD: float = float(os.environ.get("TEXT_RETRIEVAL_SCORE_THRESHOLD", "0.55"))
IMAGE_RETRIEVAL_SCORE_THRESHOLD: float = float(os.environ.get("IMAGE_RETRIEVAL_SCORE_THRESHOLD", "0.70"))
TABLE_RETRIEVAL_SCORE_THRESHOLD: float = float(os.environ.get("TABLE_RETRIEVAL_SCORE_THRESHOLD", "0.70"))

TEXT_RETRIEVAL_SCORE_MARGIN: float = float(os.environ.get("TEXT_RETRIEVAL_SCORE_MARGIN", "0.12"))
IMAGE_RETRIEVAL_SCORE_MARGIN: float = float(os.environ.get("IMAGE_RETRIEVAL_SCORE_MARGIN", "0.08"))
TABLE_RETRIEVAL_SCORE_MARGIN: float = float(os.environ.get("TABLE_RETRIEVAL_SCORE_MARGIN", "0.08"))

FINAL_TOP_K: int = int(os.environ.get("FINAL_TOP_K", "5"))

RERANK_TIMEOUT_SECONDS: float = float(os.environ.get("RERANK_TIMEOUT_SECONDS", "5"))


# ============================================================
# OCR defaults
# ============================================================

INGEST_DEFAULT_OCR_MODEL: str = os.environ.get("INGEST_DEFAULT_OCR_MODEL", "qwen3.5-plus")
INGEST_DEFAULT_WORKERS: int = max(1, int(os.environ.get("INGEST_DEFAULT_WORKERS", "4")))
INGEST_MAX_WORKERS: int = max(INGEST_DEFAULT_WORKERS, int(os.environ.get("INGEST_MAX_WORKERS", "12")))
INGEST_DPI: int = max(72, int(os.environ.get("INGEST_DPI", "220")))


# ============================================================
# Web answer defaults
# ============================================================

WEB_ANSWER_ENABLE_THINKING: bool = os.environ.get("WEB_ANSWER_ENABLE_THINKING", "false").lower() in {
    "1", "true", "yes",
}

RETRIEVAL_RETRIES: int = 2
RETRIEVAL_RETRY_DELAY_SECONDS: float = 0.6
ANSWER_ASSET_TOP_K: int = 5
ANSWER_ASSET_SCORE_THRESHOLD: float = 0.6
TEXT_CONTEXT_TOP_K: int = 3
IMAGE_CONTEXT_TOP_K: int = 2
TABLE_CONTEXT_TOP_K: int = 2
TEXT_CONTEXT_CHAR_LIMIT: int = 900
IMAGE_SUMMARY_CHAR_LIMIT: int = 200
TABLE_SUMMARY_CHAR_LIMIT: int = 220
TABLE_PREVIEW_ROW_LIMIT: int = 3
TABLE_PREVIEW_ROW_CHAR_LIMIT: int = 220
RERANK_CONFIDENCE_FLOOR: float = 0.2
QUERY_EXPANSION_SCORE_PENALTY: float = 0.02
RERANKED_BRANCH_KEYS: tuple = ("text_results",)
