import logging
import os
import traceback
from datetime import datetime

from app.config import INGESTION_OUTPUT_ROOT, RequestCredentials
from app.models import IngestRequest, JobStatus
from app.vector_store_management import delete_kb_vectors

logger = logging.getLogger(__name__)

# In-memory job tracking (volatile -- TeamClaw handles timeout detection)
ingestion_jobs: dict[str, JobStatus] = {}


def _log(job_id: str, message: str):
    """Append a timestamped log entry to the job's log list."""
    ts = datetime.now().strftime("%H:%M:%S")
    entry = f"[{ts}] {message}"
    if job_id in ingestion_jobs:
        ingestion_jobs[job_id].logs.append(entry)
    logger.info("job=%s %s", job_id[:8], message)


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

        # --- Verify file exists ---
        if not os.path.exists(req.file_path):
            raise FileNotFoundError(f"File not found: {req.file_path}")

        _log(job_id, f"Using OCR model: {creds.ocr_model}")
        ingestion_jobs[job_id].progress = 5.0

        # --- Step 0: Clean old vectors for this doc ---
        try:
            deleted = await delete_kb_vectors(kb_id=req.kb_id, doc_id=req.doc_id)
            _log(job_id, f"Cleaned {deleted} old vectors for doc_id={req.doc_id}")
        except Exception as exc:
            _log(job_id, f"Old vector cleanup skipped: {exc}")

        ingestion_jobs[job_id].progress = 10.0

        # --- Count pages for progress reporting ---
        import fitz
        doc = fitz.open(req.file_path)
        page_count = len(doc)
        doc.close()
        ingestion_jobs[job_id].page_count = page_count
        _log(job_id, f"Document has {page_count} pages")
        ingestion_jobs[job_id].progress = 15.0

        # --- Run full ingestion pipeline (OCR → extract → index) ---
        _log(job_id, "Running full ingestion pipeline (OCR + text/image/table indexing)...")

        output_dir = os.path.join(INGESTION_OUTPUT_ROOT, req.kb_id)
        os.makedirs(output_dir, exist_ok=True)

        from app.step0_document_ingestion import ingest_document

        summary = ingest_document(
            input_path=req.file_path,
            creds=creds,
            kb_id=req.kb_id,
            doc_id=req.doc_id,
            output_dir=output_dir,
        )

        text_count = summary.get("text_block_count", 0)
        image_count = summary.get("image_block_count", 0)
        table_count = summary.get("table_block_count", 0)

        _log(job_id, f"Indexed: {text_count} text blocks, {image_count} images, {table_count} tables")
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
