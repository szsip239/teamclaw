"""
Ingestion entry point — dispatches by file type to the right pipeline.

  PDF / DOCX  → app.pdf_pipeline (PaddleOCR → per-page hybrid index)
  XLSX / XLS  → app.excel_pipeline (row → policy → chunk hybrid index)

Job status is tracked in-memory via `ingestion_jobs`, polled by
GET /api/jobs/{job_id}. Restart loses pending jobs (acceptable — the
TeamClaw side marks the KnowledgeDocument as failed if no progress).
"""

from __future__ import annotations

import logging
import os
import subprocess
import traceback
from datetime import datetime
from pathlib import Path

from app.config import RequestCredentials
from app.excel_pipeline import ingest_excel
from app.models import IngestRequest, JobStatus
from app.pdf_pipeline import ingest_pdf
from app.storage import delete_kb_or_doc

logger = logging.getLogger(__name__)

ingestion_jobs: dict[str, JobStatus] = {}


def get_job_status(job_id: str) -> JobStatus | None:
    return ingestion_jobs.get(job_id)


def _log(job_id: str, message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    entry = f"[{ts}] {message}"
    if job_id in ingestion_jobs:
        ingestion_jobs[job_id].logs.append(entry)
    logger.info("job=%s %s", job_id[:8], message)


def _progress_cb(job_id: str):
    def _cb(pct: float, msg: str):
        if job_id in ingestion_jobs:
            ingestion_jobs[job_id].progress = float(pct)
        _log(job_id, msg)
    return _cb


def _convert_docx_to_pdf(docx_path: str, job_id: str) -> str:
    """Convert .docx → .pdf via LibreOffice headless. Returns PDF path."""
    output_dir = Path(docx_path).parent
    _log(job_id, "converting DOCX → PDF via LibreOffice")
    res = subprocess.run(
        [
            "libreoffice", "--headless", "--convert-to", "pdf",
            "--outdir", str(output_dir), docx_path,
        ],
        capture_output=True, text=True, timeout=120,
    )
    if res.returncode != 0:
        raise RuntimeError(f"LibreOffice conversion failed: {res.stderr[:300]}")
    pdf_path = output_dir / f"{Path(docx_path).stem}.pdf"
    if not pdf_path.exists():
        raise RuntimeError("LibreOffice produced no PDF output")
    return str(pdf_path)


async def start_ingestion(
    job_id: str, req: IngestRequest, creds: RequestCredentials
) -> None:
    ingestion_jobs[job_id] = JobStatus(job_id=job_id, status="processing", progress=0.0)
    try:
        _log(job_id, f"ingesting doc={req.doc_id} into kb={req.kb_id}")
        _log(job_id, f"file: {req.file_path}")

        if not os.path.exists(req.file_path):
            raise FileNotFoundError(f"file not found: {req.file_path}")

        # Clean any prior data for this doc (idempotent re-ingest)
        try:
            n = await delete_kb_or_doc(kb_id=req.kb_id, doc_id=req.doc_id)
            _log(job_id, f"cleaned {n} stale row(s)")
        except Exception as exc:
            _log(job_id, f"cleanup skipped: {exc}")

        suffix = Path(req.file_path).suffix.lower()
        progress = _progress_cb(job_id)

        if suffix in {".xlsx", ".xls", ".xlsm"}:
            result = await ingest_excel(
                kb_id=req.kb_id,
                doc_id=req.doc_id,
                file_path=req.file_path,
                creds=creds,
                progress=progress,
            )
            ingestion_jobs[job_id].page_count = None
            _log(job_id, f"done — {result['indexed_count']} policies")
        else:
            file_path = req.file_path
            if suffix == ".docx":
                file_path = _convert_docx_to_pdf(req.file_path, job_id)
            elif suffix != ".pdf":
                raise ValueError(f"unsupported file type: {suffix}")

            result = await ingest_pdf(
                kb_id=req.kb_id,
                doc_id=req.doc_id,
                file_path=file_path,
                file_name=req.file_name,
                display_name=req.display_name,
                creds=creds,
                progress=progress,
            )
            ingestion_jobs[job_id].page_count = result.get("page_count")
            _log(
                job_id,
                f"done — {result['chunks']} indexed page(s) across "
                f"{result.get('page_count', '?')} page(s)",
            )

        ingestion_jobs[job_id].status = "completed"
        ingestion_jobs[job_id].progress = 100.0
    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        _log(job_id, f"error: {error_msg}")
        ingestion_jobs[job_id].status = "failed"
        ingestion_jobs[job_id].error = error_msg
        traceback.print_exc()
