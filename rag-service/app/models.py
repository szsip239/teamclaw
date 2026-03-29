from pydantic import BaseModel


class IngestRequest(BaseModel):
    kb_id: str
    doc_id: str
    file_path: str  # Absolute path inside container
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
