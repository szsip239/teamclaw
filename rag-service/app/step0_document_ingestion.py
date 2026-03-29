"""
============================================================
Step 0: Document Ingestion Orchestrator
============================================================
Supports single-PDF input: OCR -> content extraction -> indexing.
All credentials are passed as function parameters.
All vector operations include kb_id for multi-tenancy.
============================================================
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from llama_index.core import Document

from app.config import (
    INGESTION_OUTPUT_ROOT,
    INGEST_DPI,
    RequestCredentials,
)
from app.document_ingestion import (
    build_pdf_ocr_image_descriptions,
    collect_pdf_ocr_output,
    copy_images_to_standard_dir,
    extract_pdf_page_labels,
    materialize_missing_pdf_region_images,
    sanitize_doc_id,
    write_manifest,
)
from app.pipeline_utils import project_root_from_file
from app.table_summary import summarize_table_blocks

logger = logging.getLogger(__name__)

PROJECT_ROOT = project_root_from_file(__file__)
BATCH_OCR_SCRIPT = os.path.abspath(os.path.join(os.path.dirname(__file__), "batch_ocr.py"))


def relpath_from_project(path: str) -> str:
    abs_path = os.path.abspath(path)
    try:
        return os.path.relpath(abs_path, PROJECT_ROOT)
    except ValueError:
        return abs_path


def ensure_script_exists() -> None:
    if not os.path.exists(BATCH_OCR_SCRIPT):
        raise FileNotFoundError(f"OCR script not found: {BATCH_OCR_SCRIPT}")


def run_batch_ocr(
    input_path: str,
    output_dir: str,
    creds: RequestCredentials,
) -> None:
    """Run the external batch OCR script."""
    ensure_script_exists()
    os.makedirs(output_dir, exist_ok=True)

    command = [
        sys.executable,
        BATCH_OCR_SCRIPT,
        "--input",
        input_path,
        "--output-dir",
        output_dir,
        "--model",
        creds.ocr_model,
        "--workers",
        str(creds.ocr_workers),
        "--dpi",
        str(INGEST_DPI),
    ]
    env = os.environ.copy()
    # The OCR script may need the LLM API key as DASHSCOPE_API_KEY
    if creds.llm_api_key and not env.get("DASHSCOPE_API_KEY"):
        env["DASHSCOPE_API_KEY"] = creds.llm_api_key
    subprocess.run(command, check=True, env=env)


def attach_text_block_metadata(
    blocks: list[dict[str, object]],
    doc_id: str,
    source_path: str,
    kb_id: str,
) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    for index, block in enumerate(blocks, start=1):
        merged = dict(block)
        merged["doc_id"] = doc_id
        merged["kb_id"] = kb_id
        merged["source_path"] = os.path.abspath(source_path)
        merged.setdefault("block_id", f"{doc_id}_text_{index:04d}")
        normalized.append(merged)
    return normalized


def attach_image_block_metadata(
    blocks: list[dict[str, object]],
    doc_id: str,
    source_path: str,
    kb_id: str,
) -> list[dict[str, object]]:
    normalized: list[dict[str, object]] = []
    for index, block in enumerate(blocks, start=1):
        merged = dict(block)
        merged["doc_id"] = doc_id
        merged["kb_id"] = kb_id
        merged["source_path"] = os.path.abspath(source_path)
        merged.setdefault("block_id", f"{doc_id}_image_{index:04d}")
        normalized.append(merged)
    return normalized


def write_document_markdown(document_path: str, content: str) -> None:
    with open(document_path, "w", encoding="utf-8") as f:
        f.write(content.strip())


def build_llama_documents(
    text_blocks: list[dict[str, object]],
    kb_id: str,
) -> list[Document]:
    """Convert text blocks to LlamaIndex Documents with kb_id metadata."""
    documents: list[Document] = []
    for block in text_blocks:
        content = str(block.get("content", "")).strip()
        if not content:
            continue
        metadata = {
            "kb_id": kb_id,
            "doc_id": block.get("doc_id", ""),
            "source_path": block.get("source_path", ""),
            "page_no": block.get("page_no"),
            "page_label": block.get("page_label", ""),
            "block_type": block.get("block_type", "text"),
            "origin": block.get("origin", ""),
            "block_id": block.get("block_id", ""),
        }
        documents.append(Document(text=content, metadata=metadata))
    return documents


def write_image_descriptions(
    descriptions: dict[str, dict],
    descriptions_path: str,
) -> bool:
    if not descriptions:
        logger.info("No image description records generated.")
        return False
    with open(descriptions_path, "w", encoding="utf-8") as f:
        json.dump(descriptions, f, ensure_ascii=False, indent=2)
    return True


def write_table_blocks(
    table_blocks: list[dict[str, object]],
    table_blocks_path: str,
) -> bool:
    if not table_blocks:
        logger.info("No table records generated.")
        return False
    with open(table_blocks_path, "w", encoding="utf-8") as f:
        json.dump(table_blocks, f, ensure_ascii=False, indent=2)
    return True


def prepare_pdf_input(
    input_path: str,
    work_dir: str,
    doc_id: str,
    kb_id: str,
    creds: RequestCredentials,
    skip_ocr: bool = False,
) -> tuple[Any, ...]:
    """Run OCR and collect structured output from a PDF."""
    raw_ocr_dir = os.path.join(work_dir, "raw_pdf_ocr")
    if skip_ocr and os.path.isdir(raw_ocr_dir):
        logger.info("--skip-ocr: reusing existing OCR output %s", raw_ocr_dir)
    else:
        run_batch_ocr(input_path, raw_ocr_dir, creds)

    ocr_doc_dir = os.path.join(raw_ocr_dir, Path(input_path).stem)
    materialize_missing_pdf_region_images(ocr_doc_dir=ocr_doc_dir)
    page_labels = extract_pdf_page_labels(input_path)
    merged_text, text_blocks, image_blocks, table_blocks = collect_pdf_ocr_output(
        ocr_doc_dir=ocr_doc_dir,
        doc_id=doc_id,
        source_path=input_path,
        page_labels=page_labels,
    )
    if table_blocks:
        table_blocks = summarize_table_blocks(table_blocks)

    text_blocks = attach_text_block_metadata(text_blocks, doc_id, input_path, kb_id)
    image_blocks = attach_image_block_metadata(image_blocks, doc_id, input_path, kb_id)
    standard_images_dir = os.path.join(work_dir, "images")
    normalized_images = copy_images_to_standard_dir(image_blocks, standard_images_dir)
    image_descriptions = build_pdf_ocr_image_descriptions(
        ocr_doc_dir=ocr_doc_dir,
        project_root=PROJECT_ROOT,
        doc_id=doc_id,
        source_path=relpath_from_project(input_path),
        page_labels=page_labels,
        images_dir=standard_images_dir,
    )

    document_md_path = os.path.join(work_dir, "document.md")
    write_document_markdown(document_md_path, merged_text)

    manifest = write_manifest(
        manifest_path=os.path.join(work_dir, "manifest.json"),
        doc_id=doc_id,
        source_path=input_path,
        document_markdown_path=document_md_path,
        text_blocks=text_blocks,
        image_blocks=normalized_images,
        table_blocks=table_blocks,
    )
    return manifest, text_blocks, normalized_images, table_blocks, document_md_path, image_descriptions


def ingest_document(
    input_path: str,
    creds: RequestCredentials,
    kb_id: str,
    doc_id: str | None = None,
    output_dir: str | None = None,
    skip_ocr: bool = False,
) -> dict[str, Any]:
    """
    Full document ingestion pipeline: OCR -> extract -> index.

    Returns a summary dict with doc_id, counts, and output paths.
    """
    from app.step2_vector_indexing import build_text_index_from_documents
    from app.step3_image_indexing import batch_index_images
    from app.step3_table_indexing import batch_index_tables

    input_path = os.path.abspath(input_path)
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Input file does not exist: {input_path}")

    suffix = Path(input_path).suffix.lower()
    if suffix != ".pdf":
        raise ValueError(f"Only PDF input is supported, got: {suffix}")

    if doc_id is None:
        doc_id = sanitize_doc_id(input_path)

    effective_output_dir = output_dir or INGESTION_OUTPUT_ROOT
    work_dir = os.path.join(os.path.abspath(effective_output_dir), doc_id)
    raw_ocr_dir = os.path.join(work_dir, "raw_pdf_ocr")

    if skip_ocr and os.path.isdir(raw_ocr_dir):
        os.makedirs(work_dir, exist_ok=True)
    else:
        if os.path.isdir(work_dir):
            shutil.rmtree(work_dir)
        os.makedirs(work_dir, exist_ok=True)

    manifest, text_blocks, image_blocks, table_blocks, document_md_path, image_descriptions = prepare_pdf_input(
        input_path, work_dir, doc_id, kb_id, creds, skip_ocr=skip_ocr
    )

    image_descriptions_path = os.path.join(work_dir, "image_descriptions.json")
    has_image_descriptions = write_image_descriptions(
        descriptions=image_descriptions,
        descriptions_path=image_descriptions_path,
    )

    table_blocks_path = os.path.join(work_dir, "table_blocks.json")
    has_table_blocks = write_table_blocks(
        table_blocks=table_blocks,
        table_blocks_path=table_blocks_path,
    )

    # Index text
    documents = build_llama_documents(text_blocks, kb_id)
    if documents:
        build_text_index_from_documents(documents, creds, kb_id)
    else:
        logger.info("No indexable text blocks, skipping text index.")

    # Index images
    if has_image_descriptions:
        batch_index_images(image_descriptions_path, creds, kb_id, project_root=PROJECT_ROOT)
    else:
        logger.info("No image descriptions to index, skipping.")

    # Index tables
    if has_table_blocks:
        batch_index_tables(table_blocks_path, creds, kb_id)
    else:
        logger.info("No table blocks to index, skipping.")

    summary = {
        "doc_id": doc_id,
        "kb_id": kb_id,
        "work_dir": work_dir,
        "document_md_path": document_md_path,
        "manifest_path": os.path.join(work_dir, "manifest.json"),
        "text_block_count": len(manifest.get("text_blocks", [])),
        "image_block_count": len(manifest.get("image_blocks", [])),
        "table_block_count": len(manifest.get("table_blocks", [])),
    }

    logger.info("Ingestion complete: %s", summary)
    return summary
