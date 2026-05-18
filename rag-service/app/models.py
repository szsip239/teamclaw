from __future__ import annotations

from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    kb_id: str
    doc_id: str
    file_path: str  # Absolute path inside container
    file_name: str | None = None
    display_name: str | None = None
    ocr_model: str = "qwen-vl-max"
    ocr_workers: int = 4


class IngestResponse(BaseModel):
    job_id: str
    status: str = "started"


class JobStatus(BaseModel):
    job_id: str
    status: str  # "processing", "completed", "failed"
    progress: float = 0.0  # 0-100
    logs: list[str] = []
    error: str | None = None
    page_count: int | None = None


class DeleteRequest(BaseModel):
    kb_id: str
    doc_id: str | None = None  # If None, delete all vectors for this KB


class DeleteResponse(BaseModel):
    deleted_count: int


class QueryRequest(BaseModel):
    kb_id: str
    question: str
    generate_answer: bool = True
    enable_thinking: bool = True
    top_k: int = 5


class RetrievalResult(BaseModel):
    text: str
    score: float
    source_type: str = "text"  # "text", "image", "table"
    metadata: dict = {}


class QueryResponse(BaseModel):
    answer: str = ""
    reasoning: str = ""
    sources: list[RetrievalResult] = []
    assets: list[dict] = []


class DefaultQueriesResponse(BaseModel):
    queries: list[str]


class DocumentIndexInfo(BaseModel):
    kb_id: str
    doc_id: str
    profile_status: str = "pending"
    profile_detail: str = ""
    summary: str = ""
    doc_type: str = ""
    keywords: list[str] = Field(default_factory=list)
    title_aliases: list[str] = Field(default_factory=list)
    chapter_summary: str = ""
    page_count: int | None = None
    indexed_page_count: int = 0
    index_row_count: int = 0
    embedded_row_count: int = 0
    updated_at: str | None = None


# ── Excel-specific ──────────────────────────────────────────────────

class ExcelPreviewRequest(BaseModel):
    file_path: str
    sample_limit: int = 3


class ExcelPreviewResponse(BaseModel):
    columns: list[str]
    sample_rows: list[dict]
    row_count: int
    sheet_name: str
    header_row: int
    guessed_config: dict


class ExcelConfigRequest(BaseModel):
    kb_id: str
    doc_id: str
    file_path: str
    config: dict  # Field mapping; normalized server-side
