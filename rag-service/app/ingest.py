import asyncio
import logging
import os
import re
import subprocess
import sys
import traceback
from datetime import datetime
from pathlib import Path

from app.config import INGESTION_OUTPUT_ROOT, INGEST_DPI, RequestCredentials
from app.models import IngestRequest, JobStatus
from app.vector_store_management import delete_kb_vectors

logger = logging.getLogger(__name__)

# In-memory job tracking (volatile -- TeamClaw handles timeout detection)
ingestion_jobs: dict[str, JobStatus] = {}

# Regex to detect OCR page progress lines like "[第 42/153 页]"
PAGE_PROGRESS_RE = re.compile(r"\[第\s*(\d+)/(\d+)\s*页\]")


def _log(job_id: str, message: str):
    """Append a timestamped log entry to the job's log list."""
    ts = datetime.now().strftime("%H:%M:%S")
    entry = f"[{ts}] {message}"
    if job_id in ingestion_jobs:
        ingestion_jobs[job_id].logs.append(entry)
    logger.info("job=%s %s", job_id[:8], message)


def _run_ocr_with_progress(
    job_id: str,
    input_path: str,
    output_dir: str,
    creds: RequestCredentials,
    page_count: int,
):
    """Run batch OCR as subprocess, capture stdout for progress updates."""
    from app.step0_document_ingestion import BATCH_OCR_SCRIPT

    os.makedirs(output_dir, exist_ok=True)

    command = [
        sys.executable,
        BATCH_OCR_SCRIPT,
        "--input", input_path,
        "--output-dir", output_dir,
        "--model", creds.ocr_model,
        "--workers", str(creds.ocr_workers),
        "--dpi", str(INGEST_DPI),
    ]
    env = os.environ.copy()
    if creds.llm_api_key and not env.get("DASHSCOPE_API_KEY"):
        env["DASHSCOPE_API_KEY"] = creds.llm_api_key

    # OCR takes 15-80% of total progress
    ocr_start = 15.0
    ocr_end = 75.0

    proc = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
        bufsize=1,
    )

    for line in iter(proc.stdout.readline, ""):
        line = line.rstrip()
        if not line:
            continue

        # Parse OCR page progress
        m = PAGE_PROGRESS_RE.search(line)
        if m:
            current_page = int(m.group(1))
            total_pages = int(m.group(2))
            pct = ocr_start + (ocr_end - ocr_start) * current_page / max(total_pages, 1)
            ingestion_jobs[job_id].progress = round(pct, 1)
            _log(job_id, f"OCR page {current_page}/{total_pages}")
        elif "✅" in line or "完成" in line:
            # Log completion lines but don't spam every detail
            pass
        elif "Error" in line or "错误" in line or "Traceback" in line:
            _log(job_id, line)

    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"OCR subprocess failed with exit code {proc.returncode}")

    ingestion_jobs[job_id].progress = ocr_end


async def start_ingestion(
    job_id: str, req: IngestRequest, creds: RequestCredentials
):
    """Run full ingestion pipeline in background. Updates ingestion_jobs dict."""
    ingestion_jobs[job_id] = JobStatus(
        job_id=job_id,
        status="processing",
        progress=0.0,
    )

    try:
        _log(job_id, f"Starting ingestion for doc {req.doc_id} in KB {req.kb_id}")
        _log(job_id, f"File: {req.file_path}")

        if not os.path.exists(req.file_path):
            raise FileNotFoundError(f"File not found: {req.file_path}")

        _log(job_id, f"Using OCR model: {creds.ocr_model}")
        ingestion_jobs[job_id].progress = 5.0

        # --- Clean old vectors ---
        try:
            deleted = await delete_kb_vectors(kb_id=req.kb_id, doc_id=req.doc_id)
            _log(job_id, f"Cleaned {deleted} old vectors")
        except Exception as exc:
            _log(job_id, f"Old vector cleanup skipped: {exc}")

        ingestion_jobs[job_id].progress = 10.0

        # --- Count pages ---
        import fitz
        doc = fitz.open(req.file_path)
        page_count = len(doc)
        doc.close()
        ingestion_jobs[job_id].page_count = page_count
        _log(job_id, f"Document has {page_count} pages")
        ingestion_jobs[job_id].progress = 15.0

        # --- Step 1: OCR with progress tracking ---
        output_dir = os.path.join(INGESTION_OUTPUT_ROOT, req.kb_id)
        raw_ocr_dir = os.path.join(output_dir, req.doc_id, "raw_pdf_ocr")

        _log(job_id, f"Starting OCR ({page_count} pages, model={creds.ocr_model})...")
        await asyncio.to_thread(
            _run_ocr_with_progress, job_id, req.file_path, raw_ocr_dir, creds, page_count
        )
        _log(job_id, "OCR complete")

        # --- Step 2: Extract + Index (uses existing OCR output) ---
        ingestion_jobs[job_id].progress = 78.0
        _log(job_id, "Extracting text/images/tables and indexing...")

        from app.step0_document_ingestion import ingest_document

        summary = await asyncio.to_thread(
            ingest_document,
            input_path=req.file_path,
            creds=creds,
            kb_id=req.kb_id,
            doc_id=req.doc_id,
            output_dir=output_dir,
            skip_ocr=True,  # OCR already done above
        )

        text_count = summary.get("text_block_count", 0)
        image_count = summary.get("image_block_count", 0)
        table_count = summary.get("table_block_count", 0)

        _log(job_id, f"Indexed: {text_count} text, {image_count} images, {table_count} tables")
        ingestion_jobs[job_id].progress = 100.0
        ingestion_jobs[job_id].status = "completed"
        _log(job_id, "Ingestion complete!")

    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        _log(job_id, f"Error: {error_msg}")
        ingestion_jobs[job_id].status = "failed"
        ingestion_jobs[job_id].error = error_msg
        traceback.print_exc()


def get_job_status(job_id: str) -> JobStatus | None:
    return ingestion_jobs.get(job_id)
