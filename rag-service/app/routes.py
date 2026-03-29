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
from app.ingest import get_job_status, start_ingestion
from app.models import (
    DefaultQueriesResponse,
    DeleteRequest,
    DeleteResponse,
    IngestRequest,
    IngestResponse,
    JobStatus,
    QueryRequest,
)
from app.query import get_default_queries, query_knowledge_base, stream_query

router = APIRouter(dependencies=[Depends(verify_service_secret)])


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


@router.delete("/documents", response_model=DeleteResponse)
async def delete_docs(req: DeleteRequest, request: Request):
    creds = get_credentials_from_headers(dict(request.headers))
    count = await delete_vectors(req.kb_id, req.doc_id, creds)
    return DeleteResponse(deleted_count=count)


@router.post("/query")
async def query_kb(req: QueryRequest, request: Request):
    creds = get_credentials_from_headers(dict(request.headers))
    result = await query_knowledge_base(req, creds)
    return result


@router.post("/query/stream")
async def query_kb_stream(req: QueryRequest, request: Request):
    creds = get_credentials_from_headers(dict(request.headers))
    return StreamingResponse(
        stream_query(req, creds),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.get(
    "/knowledge-bases/{kb_id}/default-queries",
    response_model=DefaultQueriesResponse,
)
async def default_queries(kb_id: str, request: Request):
    creds = get_credentials_from_headers(dict(request.headers))
    queries = await get_default_queries(kb_id, creds)
    return DefaultQueriesResponse(queries=queries)


@router.get("/ingest/options")
async def ingest_options():
    """Return available OCR model choices and worker config."""
    return {
        "ocr_models": [INGEST_DEFAULT_OCR_MODEL],
        "default_ocr_model": INGEST_DEFAULT_OCR_MODEL,
        "default_workers": INGEST_DEFAULT_WORKERS,
        "max_workers": INGEST_MAX_WORKERS,
    }
