"""
Ingestion pipeline:
  PDF → PaddleOCR API → markdown text → sliding-window chunks → embedding → pgvector
"""

import asyncio
import json
import logging
import os
import time
import traceback
from datetime import datetime
from pathlib import Path

import requests

from app.config import INGESTION_OUTPUT_ROOT, RequestCredentials, PGVECTOR_TEXT_TABLE
from app.models import IngestRequest, JobStatus
from app.vector_store_management import delete_kb_vectors, create_pgvector_store

logger = logging.getLogger(__name__)

ingestion_jobs: dict[str, JobStatus] = {}
PADDLEOCR_JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
OPENAI_COMPAT_EMBED_BATCH_SIZE = 10
OCR_DOCUMENT_FILE = "document.md"
OCR_MANIFEST_FILE = "manifest.json"


def get_job_status(job_id: str) -> JobStatus | None:
    return ingestion_jobs.get(job_id)


def _log(job_id: str, message: str):
    ts = datetime.now().strftime("%H:%M:%S")
    entry = f"[{ts}] {message}"
    if job_id in ingestion_jobs:
        ingestion_jobs[job_id].logs.append(entry)
    logger.info("job=%s %s", job_id[:8], message)


def build_openai_embedding_kwargs(model: str, api_key: str, api_base: str | None):
    return {
        "model": model,
        "api_key": api_key,
        "api_base": api_base or None,
        "embed_batch_size": OPENAI_COMPAT_EMBED_BATCH_SIZE,
    }


def persist_ocr_document(
    kb_id: str,
    doc_id: str,
    file_name: str,
    markdown: str,
    page_count: int | None,
) -> dict[str, str]:
    doc_dir = Path(INGESTION_OUTPUT_ROOT) / kb_id / doc_id
    doc_dir.mkdir(parents=True, exist_ok=True)

    document_path = doc_dir / OCR_DOCUMENT_FILE
    document_path.write_text(markdown, encoding="utf-8")

    manifest = {
        "kb_id": kb_id,
        "doc_id": doc_id,
        "file_name": file_name,
        "page_count": page_count,
        "document": OCR_DOCUMENT_FILE,
        "created_at": datetime.now().isoformat(),
    }
    manifest_path = doc_dir / OCR_MANIFEST_FILE
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "document_path": str(document_path),
        "manifest_path": str(manifest_path),
    }


# ── Chunking ─────────────────────────────────────────────────────────

def sliding_window_chunks(text: str, window_size: int = 500, overlap: int = 100) -> list[str]:
    if len(text) <= window_size:
        return [text] if text.strip() else []
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + window_size, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += window_size - overlap
    return chunks


# ── PaddleOCR API ────────────────────────────────────────────────────

def _run_paddleocr_api(file_path: str, token: str, model: str, job_id: str) -> str:
    _log(job_id, f"Submitting to PaddleOCR API (model={model})...")

    headers = {"Authorization": f"bearer {token}"}
    data = {
        "model": model,
        "optionalPayload": json.dumps({
            "useDocOrientationClassify": False, "useDocUnwarping": False,
            "useLayoutDetection": True, "useChartRecognition": False,
            "useSealRecognition": False, "useOcrForImageBlock": False,
            "mergeTables": True, "relevelTitles": True, "promptLabel": "ocr",
            "repetitionPenalty": 1, "temperature": 0, "topP": 1,
            "minPixels": 147384, "maxPixels": 2822400,
            "layoutNms": True, "restructurePages": True,
        }),
    }

    with open(file_path, "rb") as f:
        files = {"file": f}
        resp = requests.post(PADDLEOCR_JOB_URL, headers=headers, data=data, files=files)

    if resp.status_code != 200:
        raise RuntimeError(f"PaddleOCR submit failed: {resp.status_code} {resp.text[:300]}")

    ocr_job_id = resp.json()["data"]["jobId"]
    _log(job_id, f"PaddleOCR job: {ocr_job_id}")

    jsonl_url = ""
    for _ in range(60):
        time.sleep(5)
        jr = requests.get(f"{PADDLEOCR_JOB_URL}/{ocr_job_id}", headers=headers)
        if jr.status_code != 200:
            continue
        state = jr.json()["data"]["state"]
        if state == "running":
            try:
                p = jr.json()["data"]["extractProgress"]
                pct = 15 + int(40 * p["extractedPages"] / max(p["totalPages"], 1))
                ingestion_jobs[job_id].progress = min(pct, 55)
                _log(job_id, f"OCR: {p['extractedPages']}/{p['totalPages']} pages")
            except KeyError:
                pass
        elif state == "done":
            jsonl_url = jr.json()["data"]["resultUrl"]["jsonUrl"]
            break
        elif state == "failed":
            err = jr.json()["data"].get("errorMsg", "Unknown")
            raise RuntimeError(f"PaddleOCR failed: {err}")

    if not jsonl_url:
        raise RuntimeError("PaddleOCR timed out")

    ingestion_jobs[job_id].progress = 60
    jr = requests.get(jsonl_url)
    jr.raise_for_status()

    parts = []
    for line in jr.text.strip().split("\n"):
        if not line.strip():
            continue
        for res in json.loads(line)["result"].get("layoutParsingResults", []):
            md = res.get("markdown", {}).get("text", "")
            if md:
                parts.append(md)

    full = "\n\n".join(parts)
    _log(job_id, f"Extracted {len(full)} chars")
    return full


# ── Embedding ────────────────────────────────────────────────────────

def _index_chunks(
    chunks: list[str],
    creds: RequestCredentials,
    kb_id: str,
    doc_id: str,
    job_id: str,
):
    """Embed chunks and store in pgvector using llama-index PGVectorStore."""
    from llama_index.core import Document, VectorStoreIndex, StorageContext
    from llama_index.embeddings.openai import OpenAIEmbedding

    _log(job_id, f"Embedding {len(chunks)} chunks...")

    model = creds.embedding_model or "text-embedding-v3"

    if creds.embedding_api_key:
        from llama_index.embeddings.openai.base import OpenAIEmbeddingModelType
        # Allow non-OpenAI model names (e.g. DashScope text-embedding-v4) to
        # pass OpenAIEmbedding's enum validation.
        if model not in OpenAIEmbeddingModelType._value2member_map_:
            OpenAIEmbeddingModelType._value2member_map_[model] = \
                OpenAIEmbeddingModelType.TEXT_EMBED_3_SMALL

        embed_model = OpenAIEmbedding(
            **build_openai_embedding_kwargs(
                model=model,
                api_key=creds.embedding_api_key,
                api_base=creds.embedding_base_url,
            ),
        )
        # The monkey-patch above maps unknown models to TEXT_EMBED_3_SMALL
        # whose .value is "text-embedding-3-small". Override both model_name
        # and _text_engine (the latter is what _get_text_embeddings actually
        # sends to the API) with the user's real model name.
        embed_model.model_name = model
        embed_model._text_engine = model
    else:
        _log(job_id, "No embedding API key — text-only storage (no vectors)")
        embed_model = None

    if embed_model is None:
        _log(job_id, "Skipping indexing (no embed_model)")
        return

    documents = [
        Document(text=chunk, metadata={"kb_id": kb_id, "doc_id": doc_id, "chunk_idx": i})
        for i, chunk in enumerate(chunks)
    ]

    text_store = create_pgvector_store(PGVECTOR_TEXT_TABLE)
    storage_context = StorageContext.from_defaults(vector_store=text_store)

    VectorStoreIndex.from_documents(
        documents, storage_context=storage_context, embed_model=embed_model,
    )

    _log(job_id, f"Indexed {len(chunks)} chunks")


# ── Main ─────────────────────────────────────────────────────────────

async def start_ingestion(job_id: str, req: IngestRequest, creds: RequestCredentials):
    ingestion_jobs[job_id] = JobStatus(job_id=job_id, status="processing", progress=0.0)

    try:
        _log(job_id, f"Ingesting doc {req.doc_id} into KB {req.kb_id}")
        _log(job_id, f"File: {req.file_path}")

        if not os.path.exists(req.file_path):
            raise FileNotFoundError(f"File not found: {req.file_path}")

        ingestion_jobs[job_id].progress = 5.0

        try:
            deleted = await delete_kb_vectors(kb_id=req.kb_id, doc_id=req.doc_id)
            _log(job_id, f"Cleaned {deleted} old vectors")
        except Exception as exc:
            _log(job_id, f"Cleanup skipped: {exc}")

        ingestion_jobs[job_id].progress = 10.0

        if not creds.paddleocr_token:
            raise RuntimeError("PaddleOCR token not configured. Set it in Settings → RAG.")

        import fitz
        doc = fitz.open(req.file_path)
        page_count = len(doc)
        doc.close()
        ingestion_jobs[job_id].page_count = page_count

        _log(job_id, f"Embedding key present: {bool(creds.embedding_api_key)}, model: {creds.embedding_model}")

        # Step 1: OCR
        md_text = await asyncio.to_thread(
            _run_paddleocr_api,
            req.file_path, creds.paddleocr_token,
            creds.paddleocr_model or "PaddleOCR-VL-1.5", job_id,
        )
        artifact_paths = persist_ocr_document(
            req.kb_id,
            req.doc_id,
            Path(req.file_path).name,
            md_text,
            page_count,
        )
        _log(job_id, f"OCR Markdown saved: {artifact_paths['document_path']}")
        ingestion_jobs[job_id].progress = 80.0

        if not md_text.strip():
            _log(job_id, "No text extracted")
            ingestion_jobs[job_id].status = "completed"
            ingestion_jobs[job_id].progress = 100.0
            return

        # Step 2: Chunk
        chunks = sliding_window_chunks(md_text, 500, 100)
        _log(job_id, f"Created {len(chunks)} chunks (window=500, overlap=100)")
        ingestion_jobs[job_id].progress = 85.0

        # Step 3: Embed + Index
        if chunks:
            await asyncio.to_thread(_index_chunks, chunks, creds, req.kb_id, req.doc_id, job_id)

        ingestion_jobs[job_id].progress = 100.0
        ingestion_jobs[job_id].status = "completed"
        _log(job_id, f"Done — {len(chunks)} chunks indexed")

    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        _log(job_id, f"Error: {error_msg}")
        ingestion_jobs[job_id].status = "failed"
        ingestion_jobs[job_id].error = error_msg
        traceback.print_exc()
