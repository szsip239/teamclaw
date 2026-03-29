"""
============================================================
Step 3: Image Description Indexing
============================================================
Stores LLM-generated image descriptions as TextNode vectors in
PGVectorStore.  Each node carries ``kb_id`` in metadata for
multi-tenant filtering.

Credentials are passed as function parameters.
============================================================
"""

from __future__ import annotations

import json
import logging
import os

from llama_index.core.schema import TextNode
from llama_index.core import VectorStoreIndex, StorageContext

from app.config import (
    PGVECTOR_IMAGE_TABLE,
    RequestCredentials,
)
from app.model_provider_utils import create_embedding_model
from app.pipeline_utils import resolve_source_image_path
from app.vector_store_management import create_pgvector_store

logger = logging.getLogger(__name__)


def _make_embed_model(creds: RequestCredentials):
    return create_embedding_model(
        model_name=creds.embedding_model,
        api_key=creds.embedding_api_key,
        api_base=creds.embedding_base_url or None,
    )


def index_single_image(
    img_id: str,
    desc_data: dict,
    img_path: str,
    kb_id: str,
) -> TextNode:
    """
    Create a TextNode from a single image description.

    The text field is ``detailed_description`` (used for embedding).
    Metadata carries all ancillary info plus ``kb_id``.
    """
    node = TextNode(
        text=desc_data["detailed_description"],
        metadata={
            "kb_id": kb_id,
            "image_id": img_id,
            "image_path": img_path,
            "image_filename": desc_data.get(
                "source_image_filename", os.path.basename(img_path)
            ),
            "image_rel_path": desc_data.get("source_image_path", ""),
            "doc_id": desc_data.get("doc_id", ""),
            "source_document_path": desc_data.get("source_document_path", ""),
            "page_no": desc_data.get("page_no"),
            "page_label": desc_data.get("page_label", ""),
            "origin": desc_data.get("origin", "image_description"),
            "block_type": desc_data.get("block_type", "image"),
            "summary": desc_data.get("summary", ""),
            "tags": desc_data.get("tags", []),
            "nodes_in_chart": desc_data.get("nodes", []),
            "type": "image_description",
        },
    )
    return node


def batch_index_images(
    descriptions_file: str,
    creds: RequestCredentials,
    kb_id: str,
    project_root: str | None = None,
) -> VectorStoreIndex:
    """
    Batch-index image descriptions from a JSON file into PGVectorStore.
    """
    if not os.path.exists(descriptions_file):
        raise FileNotFoundError(f"Description file not found: {descriptions_file}")

    with open(descriptions_file, "r", encoding="utf-8") as f:
        all_descriptions = json.load(f)

    logger.info("Read %d image descriptions", len(all_descriptions))

    nodes = []
    for img_id, desc_data in all_descriptions.items():
        try:
            img_path = resolve_source_image_path(img_id, desc_data, project_root or ".")
        except FileNotFoundError as exc:
            logger.warning("Skipping %s: %s", img_id, exc)
            continue

        node = index_single_image(img_id, desc_data, img_path, kb_id)
        nodes.append(node)
        logger.info("  + %s: %s...", img_id, desc_data.get("summary", "")[:40])

    if not nodes:
        raise ValueError("No indexable image descriptions found.")

    image_store = create_pgvector_store(PGVECTOR_IMAGE_TABLE)
    storage_context = StorageContext.from_defaults(vector_store=image_store)
    embed_model = _make_embed_model(creds)

    logger.info("Generating embeddings and storing in PGVector...")
    index = VectorStoreIndex(
        nodes=nodes,
        storage_context=storage_context,
        embed_model=embed_model,
        show_progress=True,
    )

    logger.info(
        "Image description index built. table=%s count=%d",
        PGVECTOR_IMAGE_TABLE,
        len(nodes),
    )
    return index


def load_image_index(creds: RequestCredentials) -> VectorStoreIndex:
    """Load existing image description index from PGVector."""
    image_store = create_pgvector_store(PGVECTOR_IMAGE_TABLE)
    embed_model = _make_embed_model(creds)

    index = VectorStoreIndex.from_vector_store(
        vector_store=image_store,
        embed_model=embed_model,
    )
    logger.info("Loaded image description index: %s", PGVECTOR_IMAGE_TABLE)
    return index
