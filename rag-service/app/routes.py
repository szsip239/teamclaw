import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.auth import verify_service_secret
from app.config import (
    get_credentials_from_headers,
    INGEST_DEFAULT_OCR_MODEL,
    INGEST_DEFAULT_WORKERS,
    INGEST_MAX_WORKERS,
)
from app.delete import delete_vectors
from app.excel_pipeline import (
    guess_excel_config,
    ingest_excel,
    parse_excel_preview,
)
from app.ingest import get_job_status, start_ingestion
from app.models import (
    DefaultQueriesResponse,
    DeleteRequest,
    DeleteResponse,
    DocumentIndexInfo,
    ExcelConfigRequest,
    ExcelPreviewRequest,
    ExcelPreviewResponse,
    IngestRequest,
    IngestResponse,
    JobStatus,
    QueryRequest,
)
from app.query import get_default_queries, query_knowledge_base, stream_query
from app.storage import get_document_index_info

router = APIRouter(dependencies=[Depends(verify_service_secret)])


# ── Ingest ──────────────────────────────────────────────────────────

@router.post("/ingest", response_model=IngestResponse)
async def ingest_document(req: IngestRequest, request: Request):
    creds = get_credentials_from_headers(dict(request.headers))
    job_id = str(uuid.uuid4())
    asyncio.create_task(start_ingestion(job_id, req, creds))
    return IngestResponse(job_id=job_id, status="started")


@router.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job(job_id: str):
    status = get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status


@router.get(
    "/knowledge-bases/{kb_id}/documents/{doc_id}/index-info",
    response_model=DocumentIndexInfo,
)
async def document_index_info(kb_id: str, doc_id: str):
    return DocumentIndexInfo(**await get_document_index_info(kb_id=kb_id, doc_id=doc_id))


@router.get("/ingest/options")
async def ingest_options():
    """OCR model choices and worker config."""
    return {
        "ocr_models": [INGEST_DEFAULT_OCR_MODEL],
        "default_ocr_model": INGEST_DEFAULT_OCR_MODEL,
        "default_workers": INGEST_DEFAULT_WORKERS,
        "max_workers": INGEST_MAX_WORKERS,
    }


# ── Excel-specific ──────────────────────────────────────────────────

@router.post("/excel/preview", response_model=ExcelPreviewResponse)
async def excel_preview(req: ExcelPreviewRequest):
    """Preview an Excel file's headers + sample rows + guessed field mapping."""
    try:
        preview = parse_excel_preview(req.file_path, sample_limit=req.sample_limit)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return ExcelPreviewResponse(
        **preview,
        guessed_config=guess_excel_config(preview["columns"]),
    )


@router.post("/excel/config", response_model=IngestResponse)
async def excel_config(req: ExcelConfigRequest, request: Request):
    """Trigger Excel ingestion with an explicit field-mapping config."""
    creds = get_credentials_from_headers(dict(request.headers))
    job_id = str(uuid.uuid4())

    async def _run():
        from app.ingest import _log, _progress_cb, ingestion_jobs
        from app.models import JobStatus as JS

        ingestion_jobs[job_id] = JS(
            job_id=job_id, status="processing", progress=0.0,
        )
        try:
            await ingest_excel(
                kb_id=req.kb_id,
                doc_id=req.doc_id,
                file_path=req.file_path,
                creds=creds,
                config=req.config,
                progress=_progress_cb(job_id),
            )
            ingestion_jobs[job_id].status = "completed"
            ingestion_jobs[job_id].progress = 100.0
        except Exception as exc:
            _log(job_id, f"error: {type(exc).__name__}: {exc}")
            ingestion_jobs[job_id].status = "failed"
            ingestion_jobs[job_id].error = str(exc)

    asyncio.create_task(_run())
    return IngestResponse(job_id=job_id, status="started")


# ── Delete ──────────────────────────────────────────────────────────

@router.delete("/documents", response_model=DeleteResponse)
async def delete_docs(req: DeleteRequest, request: Request):
    creds = get_credentials_from_headers(dict(request.headers))
    count = await delete_vectors(req.kb_id, req.doc_id, creds)
    return DeleteResponse(deleted_count=count)


# ── Query ───────────────────────────────────────────────────────────

@router.post("/query")
async def query_kb(req: QueryRequest, request: Request):
    creds = get_credentials_from_headers(dict(request.headers))
    return await query_knowledge_base(req, creds)


@router.post("/query/stream")
async def query_kb_stream(req: QueryRequest, request: Request):
    creds = get_credentials_from_headers(dict(request.headers))
    return StreamingResponse(
        stream_query(req, creds),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get(
    "/knowledge-bases/{kb_id}/default-queries",
    response_model=DefaultQueriesResponse,
)
async def default_queries(kb_id: str, request: Request):
    creds = get_credentials_from_headers(dict(request.headers))
    queries = await get_default_queries(kb_id, creds)
    return DefaultQueriesResponse(queries=queries)
