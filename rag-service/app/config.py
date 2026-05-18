"""
============================================================
TeamClaw RAG Service — Unified Configuration
============================================================
Per-request credentials (API keys, model names) come from HTTP headers.
Container-level settings (DATABASE_URL, paths) come from env vars.
============================================================
"""

import os
from dataclasses import dataclass


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

    ocr_model: str = ""
    ocr_workers: int = 4

    paddleocr_token: str = ""
    paddleocr_model: str = "PP-OCRv5"


def _env_first(*names: str, default: str = "") -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return default


def _normalize_openai_base_url(value: str) -> str:
    # The reference llm-rag app stores SiliconFlow's full embeddings endpoint
    # in SILICONFLOW_EMBEDDING_URL. OpenAI-compatible clients need the API root.
    clean = value.rstrip("/")
    if clean.endswith("/embeddings"):
        return clean[: -len("/embeddings")]
    return clean


def get_credentials_from_headers(headers: dict) -> RequestCredentials:
    """Extract per-request credentials from HTTP headers.

    Credential resolution (SystemConfig → env → defaults) happens in
    Next.js (src/lib/knowledge-base/credentials.ts). The Python side
    trusts the resolved header values and does NOT re-read environment
    variables, so there is a single source of truth for debugging.
    """
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
        embedding_base_url=_normalize_openai_base_url(
            headers.get("x-embedding-base-url", ""),
        ),
        embedding_model=headers.get("x-embedding-model", ""),
        rerank_enabled=rerank_enabled,
        rerank_api_key=headers.get("x-rerank-api-key", ""),
        rerank_base_url=headers.get("x-rerank-base-url", ""),
        rerank_model=headers.get("x-rerank-model", ""),
        ocr_model=headers.get("x-ocr-model", ""),
        ocr_workers=ocr_workers,
        paddleocr_token=headers.get("x-paddleocr-token", ""),
        paddleocr_model=headers.get("x-paddleocr-model", "PP-OCRv5"),
    )


# ============================================================
# Container-level settings (env vars)
# ============================================================

DATABASE_URL: str = os.environ.get("DATABASE_URL", "")
RAG_SERVICE_SECRET: str = os.environ.get("RAG_SERVICE_SECRET", "")

INGESTION_OUTPUT_ROOT: str = os.environ.get(
    "INGESTION_OUTPUT_ROOT",
    os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "ingestion_output",
    ),
)

# Must match the embedding model's output dimension. Drop+recreate
# rag.* tables if this changes.
PGVECTOR_EMBED_DIM: int = int(os.environ.get("PGVECTOR_EMBED_DIM", "1024"))


# ============================================================
# OCR + ingest defaults
# ============================================================

INGEST_DEFAULT_OCR_MODEL: str = _env_first(
    "INGEST_DEFAULT_OCR_MODEL",
    "PADDLEOCR_MODEL",
    default="PP-OCRv5",
)
INGEST_DEFAULT_WORKERS: int = max(1, int(os.environ.get("INGEST_DEFAULT_WORKERS", "4")))
INGEST_MAX_WORKERS: int = max(
    INGEST_DEFAULT_WORKERS, int(os.environ.get("INGEST_MAX_WORKERS", "12"))
)

PADDLEOCR_JOB_URL: str = _env_first(
    "PADDLEOCR_JOB_URL",
    default="https://paddleocr.aistudio-app.com/api/v2/ocr/jobs",
)
PADDLEOCR_RETRY_ATTEMPTS: int = max(1, int(os.environ.get("PADDLEOCR_RETRY_ATTEMPTS", "3")))
PADDLEOCR_RETRY_BACKOFF: int = max(1, int(os.environ.get("PADDLEOCR_RETRY_BACKOFF", "5")))
PADDLEOCR_POLL_INTERVAL: int = max(1, int(os.environ.get("PADDLEOCR_POLL_INTERVAL", "5")))
PADDLEOCR_STALL_TIMEOUT: int = max(
    PADDLEOCR_POLL_INTERVAL * 2,
    int(os.environ.get("PADDLEOCR_STALL_TIMEOUT", os.environ.get("PADDLEOCR_SYNC_TIMEOUT", "180"))),
)
PADDLEOCR_JOB_TIMEOUT: int = max(
    PADDLEOCR_STALL_TIMEOUT,
    int(os.environ.get("PADDLEOCR_JOB_TIMEOUT", "1800")),
)
PADDLEOCR_CHUNK_PAGE_THRESHOLD: int = max(
    1,
    int(os.environ.get("PADDLEOCR_CHUNK_PAGE_THRESHOLD", os.environ.get("PADDLEOCR_SYNC_PDF_MAX_PAGES", "48"))),
)
PADDLEOCR_CHUNK_SIZE: int = max(1, int(os.environ.get("PADDLEOCR_CHUNK_SIZE", "40")))
DOCUMENT_CHAPTER_SUMMARY_CHUNK_SIZE: int = max(
    1,
    int(os.environ.get("DOCUMENT_CHAPTER_SUMMARY_CHUNK_SIZE", "40")),
)
DOCUMENT_PROFILE_MAX_TOKENS: int = max(
    1,
    int(os.environ.get("DOCUMENT_PROFILE_MAX_TOKENS", "384")),
)
DOCUMENT_CHAPTER_SUMMARY_MAX_TOKENS: int = max(
    4096,
    int(os.environ.get("DOCUMENT_CHAPTER_SUMMARY_MAX_TOKENS", "4096")),
)


# ============================================================
# PDF page rendering (for vision-LLM answering)
# Matches llm-rag pdf_qa.py defaults.
# ============================================================

# Ingest-time render: stored to disk under {artifact_dir}/pages/page-NNNN.jpg
UPLOAD_RENDER_DPI: int = max(60, int(os.environ.get("UPLOAD_RENDER_DPI", "110")))
UPLOAD_RENDER_MAX_PIXELS: int = max(
    100_000, int(os.environ.get("UPLOAD_RENDER_MAX_PIXELS", "900000"))
)
UPLOAD_RENDER_JPEG_QUALITY: int = max(
    30, min(95, int(os.environ.get("UPLOAD_RENDER_JPEG_QUALITY", "72")))
)

# Query-time recompression for the LLM payload (smaller than stored copy)
LLM_RENDER_MAX_PIXELS: int = max(
    100_000, int(os.environ.get("LLM_RENDER_MAX_PIXELS", "640000"))
)
LLM_RENDER_JPEG_QUALITY: int = max(
    30, min(95, int(os.environ.get("LLM_RENDER_JPEG_QUALITY", "60")))
)

# Multi-doc page budget when answering
MULTI_DOC_TOTAL_PAGE_BUDGET: int = max(
    1, int(os.environ.get("MULTI_DOC_TOTAL_PAGE_BUDGET", "15"))
)
MULTI_DOC_PER_DOC_PAGE_LIMIT: int = max(
    1, int(os.environ.get("MULTI_DOC_PER_DOC_PAGE_LIMIT", "6"))
)
MULTI_DOC_SINGLE_DOC_PAGE_LIMIT: int = max(
    1, int(os.environ.get("MULTI_DOC_SINGLE_DOC_PAGE_LIMIT", "30"))
)
