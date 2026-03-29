import logging
import os
import traceback
from datetime import datetime

from app.config import RequestCredentials
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
    """Run ingestion in background. Updates ingestion_jobs dict."""
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

        # --- Step 1: PDF parsing with PyMuPDF ---
        _log(job_id, "Parsing PDF...")
        import fitz  # PyMuPDF

        doc = fitz.open(req.file_path)
        page_count = len(doc)
        ingestion_jobs[job_id].page_count = page_count
        _log(job_id, f"Document has {page_count} pages")
        ingestion_jobs[job_id].progress = 20.0

        # Extract text from each page
        pages_text: list[str] = []
        for i, page in enumerate(doc):
            text = page.get_text()
            pages_text.append(text)
            if (i + 1) % 10 == 0:
                _log(job_id, f"Extracted text from page {i + 1}/{page_count}")
                ingestion_jobs[job_id].progress = 20.0 + (
                    30.0 * (i + 1) / page_count
                )

        doc.close()
        _log(job_id, "Text extraction complete")
        ingestion_jobs[job_id].progress = 50.0

        # --- Step 2: Create text chunks ---
        _log(job_id, "Chunking text...")
        from llama_index.core.node_parser import SentenceSplitter
        from llama_index.core.schema import Document

        full_text = "\n\n".join(pages_text)
        if not full_text.strip():
            _log(job_id, "Warning: No text extracted from PDF")

        splitter = SentenceSplitter(chunk_size=512, chunk_overlap=50)
        documents = [
            Document(
                text=full_text,
                metadata={
                    "kb_id": req.kb_id,
                    "doc_id": req.doc_id,
                    "file_name": os.path.basename(req.file_path),
                },
            )
        ]
        nodes = splitter.get_nodes_from_documents(documents)

        # Inject kb_id and doc_id into every node's metadata
        for node in nodes:
            node.metadata["kb_id"] = req.kb_id
            node.metadata["doc_id"] = req.doc_id

        _log(job_id, f"Created {len(nodes)} text chunks")
        ingestion_jobs[job_id].progress = 60.0

        # --- Step 3: Create embeddings and store in PGVectorStore ---
        _log(job_id, "Creating embeddings and storing vectors...")
        from llama_index.core.ingestion import IngestionPipeline

        from app.model_provider_utils import create_embedding_model
        from app.vector_store_management import create_pgvector_store
        from app.config import PGVECTOR_TEXT_TABLE

        embed_model = create_embedding_model(
            model_name=creds.embedding_model,
            api_key=creds.embedding_api_key,
            api_base=creds.embedding_base_url or None,
        )

        vector_store = create_pgvector_store(PGVECTOR_TEXT_TABLE)

        pipeline = IngestionPipeline(
            transformations=[embed_model],
            vector_store=vector_store,
        )

        await pipeline.arun(nodes=nodes, show_progress=False)

        _log(job_id, f"Stored {len(nodes)} vectors in pgvector")
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
