"""
============================================================
Step 2: Vector Indexing (Document Text)
============================================================
Splits document text into chunks, generates embeddings, and stores
them in PGVectorStore.  All nodes carry ``kb_id`` in metadata for
multi-tenant filtering.

Credentials (API keys, model names) are passed as function
parameters — no module-level globals.
============================================================
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from llama_index.core import VectorStoreIndex, StorageContext
from llama_index.core import SimpleDirectoryReader

from app.config import (
    PGVECTOR_TEXT_TABLE,
    RequestCredentials,
)
from app.model_provider_utils import create_embedding_model
from app.vector_store_management import create_pgvector_store

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


def _make_embed_model(creds: RequestCredentials):
    return create_embedding_model(
        model_name=creds.embedding_model,
        api_key=creds.embedding_api_key,
        api_base=creds.embedding_base_url or None,
    )


def build_text_index(
    docs_dir: str,
    creds: RequestCredentials,
    kb_id: str,
) -> VectorStoreIndex:
    """
    Build a vector index from a document directory.

    Flow:
        1. SimpleDirectoryReader loads and parses all document files.
        2. LlamaIndex splits documents into chunks (default SentenceSplitter).
        3. Each chunk is embedded and stored in PGVectorStore.
        4. ``kb_id`` is injected into every document's metadata.
    """
    logger.info("Loading documents from: %s", docs_dir)

    documents = SimpleDirectoryReader(docs_dir).load_data()
    logger.info("Loaded %d documents", len(documents))

    # Inject kb_id into every document's metadata
    for doc in documents:
        doc.metadata["kb_id"] = kb_id

    text_store = create_pgvector_store(PGVECTOR_TEXT_TABLE)
    storage_context = StorageContext.from_defaults(vector_store=text_store)
    embed_model = _make_embed_model(creds)

    logger.info("Building vector index (chunk -> embedding -> PGVector)...")
    index = VectorStoreIndex.from_documents(
        documents,
        storage_context=storage_context,
        embed_model=embed_model,
        show_progress=True,
    )

    logger.info("Text index built. table=%s", PGVECTOR_TEXT_TABLE)
    return index


def build_text_index_from_documents(
    documents: list,
    creds: RequestCredentials,
    kb_id: str,
) -> VectorStoreIndex:
    """
    Build a text vector index from pre-prepared LlamaIndex Document objects.

    Called by step0_document_ingestion to avoid writing intermediate files.
    """
    # Inject kb_id into every document's metadata
    for doc in documents:
        doc.metadata["kb_id"] = kb_id

    text_store = create_pgvector_store(PGVECTOR_TEXT_TABLE)
    storage_context = StorageContext.from_defaults(vector_store=text_store)
    embed_model = _make_embed_model(creds)

    logger.info("Building text vector index (chunk -> embedding -> PGVector)...")
    index = VectorStoreIndex.from_documents(
        documents,
        storage_context=storage_context,
        embed_model=embed_model,
        show_progress=True,
    )

    logger.info("Text index built. table=%s", PGVECTOR_TEXT_TABLE)
    return index


def load_existing_index(creds: RequestCredentials) -> VectorStoreIndex:
    """
    Load an existing text vector index from PGVector (no rebuild).
    Used by step4_basic_query for retrieval.
    """
    text_store = create_pgvector_store(PGVECTOR_TEXT_TABLE)
    embed_model = _make_embed_model(creds)

    index = VectorStoreIndex.from_vector_store(
        vector_store=text_store,
        embed_model=embed_model,
    )
    logger.info("Loaded existing text index: %s", PGVECTOR_TEXT_TABLE)
    return index
