"""
============================================================
Step 3T: Table Block Indexing
============================================================
Stores table blocks as TextNode vectors in PGVectorStore.
Each node carries ``kb_id`` in metadata for multi-tenant filtering.

Credentials are passed as function parameters.
============================================================
"""

from __future__ import annotations

import json
import logging
import os

from llama_index.core import StorageContext, VectorStoreIndex
from llama_index.core.schema import TextNode

from app.config import (
    PGVECTOR_TABLE_TABLE,
    RequestCredentials,
)
from app.model_provider_utils import create_embedding_model
from app.vector_store_management import create_pgvector_store

logger = logging.getLogger(__name__)

MAX_TABLE_EMBED_TEXT_LENGTH = 8192
TRUNCATION_MARKER = "\n[content truncated]\n"


def _clip_utf8_head(text: str, byte_limit: int) -> str:
    encoded = text.encode("utf-8")
    if len(encoded) <= byte_limit:
        return text
    clipped = encoded[:byte_limit]
    while clipped:
        try:
            return clipped.decode("utf-8")
        except UnicodeDecodeError:
            clipped = clipped[:-1]
    return ""


def _clip_utf8_tail(text: str, byte_limit: int) -> str:
    encoded = text.encode("utf-8")
    if len(encoded) <= byte_limit:
        return text
    clipped = encoded[-byte_limit:]
    while clipped:
        try:
            return clipped.decode("utf-8")
        except UnicodeDecodeError:
            clipped = clipped[1:]
    return ""


def _truncate_table_embedding_text(text: str, limit: int = MAX_TABLE_EMBED_TEXT_LENGTH) -> str:
    normalized = (text or "").strip()
    encoded = normalized.encode("utf-8")
    if len(encoded) <= limit:
        return normalized

    marker_budget = limit - len(TRUNCATION_MARKER.encode("utf-8"))
    if marker_budget <= 0:
        return _clip_utf8_head(normalized, limit)

    head_budget = int(marker_budget * 0.7)
    tail_budget = marker_budget - head_budget
    head = _clip_utf8_head(normalized, head_budget).rstrip()
    tail = _clip_utf8_tail(normalized, tail_budget).lstrip() if tail_budget > 0 else ""
    return f"{head}{TRUNCATION_MARKER}{tail}"


def _make_embed_model(creds: RequestCredentials):
    return create_embedding_model(
        model_name=creds.embedding_model,
        api_key=creds.embedding_api_key,
        api_base=creds.embedding_base_url or None,
    )


def index_single_table(table_block: dict[str, object], kb_id: str) -> TextNode:
    """Create a TextNode from a single table block with kb_id metadata."""
    normalized_text = str(table_block.get("normalized_table_text", "")).strip()
    raw_table = str(table_block.get("raw_table", "")).strip()
    table_id = str(table_block.get("table_id", "")).strip()
    semantic_summary = str(
        table_block.get("semantic_summary", "") or table_block.get("summary", "")
    ).strip()

    text_parts = []
    if semantic_summary:
        text_parts.append(semantic_summary)
    if normalized_text:
        text_parts.append(normalized_text)
    elif raw_table:
        text_parts.append(raw_table)

    text = _truncate_table_embedding_text("\n".join(text_parts))
    if not text:
        raise ValueError(f"Table block has no indexable text: {table_id or table_block}")

    metadata = {
        "kb_id": kb_id,
        "table_id": table_id,
        "doc_id": table_block.get("doc_id", ""),
        "source_path": table_block.get("source_path", ""),
        "page_no": table_block.get("page_no"),
        "page_label": table_block.get("page_label", ""),
        "origin": table_block.get("origin", "pdf_ocr"),
        "block_type": table_block.get("block_type", "table"),
        "summary": semantic_summary,
        "semantic_summary": semantic_summary,
        "caption": table_block.get("caption", ""),
        "headers": table_block.get("headers", []),
        "table_type": table_block.get("table_type", "simple"),
        "raw_format": table_block.get("raw_format", "markdown"),
        "raw_table": raw_table,
        "normalized_table_text": normalized_text,
        "continued_from_prev": table_block.get("continued_from_prev", False),
        "continues_to_next": table_block.get("continues_to_next", False),
        "bbox_normalized": table_block.get("bbox_normalized", []),
        "type": "table_block",
    }

    return TextNode(
        text=text,
        metadata=metadata,
        excluded_embed_metadata_keys=list(metadata.keys()),
    )


def batch_index_tables(
    table_blocks_file: str,
    creds: RequestCredentials,
    kb_id: str,
) -> VectorStoreIndex:
    """Batch-index table blocks from a JSON file into PGVectorStore."""
    if not os.path.exists(table_blocks_file):
        raise FileNotFoundError(f"Table blocks file not found: {table_blocks_file}")

    with open(table_blocks_file, "r", encoding="utf-8") as f:
        table_blocks = json.load(f)

    logger.info("Read %d table blocks", len(table_blocks))
    nodes = []
    for table_block in table_blocks:
        node = index_single_table(table_block, kb_id)
        nodes.append(node)
        logger.info(
            "  + %s: %s...",
            table_block.get("table_id", ""),
            str(table_block.get("summary", ""))[:40],
        )

    if not nodes:
        raise ValueError("No indexable table blocks found.")

    table_store = create_pgvector_store(PGVECTOR_TABLE_TABLE)
    storage_context = StorageContext.from_defaults(vector_store=table_store)
    embed_model = _make_embed_model(creds)

    logger.info("Generating table embeddings and storing in PGVector...")
    index = VectorStoreIndex(
        nodes=nodes,
        storage_context=storage_context,
        embed_model=embed_model,
        show_progress=True,
    )

    logger.info(
        "Table index built. table=%s count=%d",
        PGVECTOR_TABLE_TABLE,
        len(nodes),
    )
    return index


def load_table_index(creds: RequestCredentials) -> VectorStoreIndex:
    """Load existing table index from PGVector."""
    table_store = create_pgvector_store(PGVECTOR_TABLE_TABLE)
    embed_model = _make_embed_model(creds)

    index = VectorStoreIndex.from_vector_store(
        vector_store=table_store,
        embed_model=embed_model,
    )
    logger.info("Loaded table index: %s", PGVECTOR_TABLE_TABLE)
    return index
