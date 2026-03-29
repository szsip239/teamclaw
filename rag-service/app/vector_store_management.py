"""
============================================================
Vector Store Management — PGVectorStore
============================================================
Creates PGVectorStore instances and handles vector deletion
using asyncpg for direct SQL operations.
============================================================
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

import asyncpg

from app.config import (
    DATABASE_URL,
    PGVECTOR_EMBED_DIM,
    PGVECTOR_IMAGE_TABLE,
    PGVECTOR_SCHEMA,
    PGVECTOR_TABLE_TABLE,
    PGVECTOR_TEXT_TABLE,
)

logger = logging.getLogger(__name__)


def managed_table_names() -> list[str]:
    """Return the list of PGVector table names managed by this service."""
    return [
        PGVECTOR_TEXT_TABLE,
        PGVECTOR_IMAGE_TABLE,
        PGVECTOR_TABLE_TABLE,
    ]


def create_pgvector_store(table_name: str, embed_dim: int | None = None):
    """
    Create a PGVectorStore instance from DATABASE_URL.

    The llama-index PGVectorStore prefixes table names with ``data_``,
    so a table_name of ``text_chunks`` becomes ``data_text_chunks`` in
    the actual database.
    """
    from llama_index.vector_stores.postgres import PGVectorStore

    parsed = urlparse(DATABASE_URL)
    return PGVectorStore.from_params(
        database=parsed.path.lstrip("/").split("?")[0],
        host=parsed.hostname or "localhost",
        port=str(parsed.port or 5432),
        user=parsed.username or "teamclaw",
        password=parsed.password or "",
        table_name=table_name,
        schema_name=PGVECTOR_SCHEMA,
        embed_dim=embed_dim or PGVECTOR_EMBED_DIM,
    )


def _fully_qualified_table(table_name: str) -> str:
    """Return the fully-qualified table name including the ``data_`` prefix."""
    return f"{PGVECTOR_SCHEMA}.data_{table_name}"


async def delete_kb_vectors(
    kb_id: str,
    doc_id: str | None = None,
    table_names: list[str] | None = None,
) -> int:
    """
    Delete vectors from PGVector tables filtered by kb_id and optional doc_id.

    The metadata column in PGVectorStore is ``metadata_`` (with trailing
    underscore).  We query it as JSONB: ``metadata_->>'kb_id' = $1``.

    Returns the total number of deleted rows across all tables.
    """
    conn = await asyncpg.connect(DATABASE_URL)
    total_deleted = 0
    try:
        for table_name in table_names or managed_table_names():
            fq_table = _fully_qualified_table(table_name)
            try:
                if doc_id:
                    result = await conn.execute(
                        f"DELETE FROM {fq_table} "
                        "WHERE metadata_->>'kb_id' = $1 AND metadata_->>'doc_id' = $2",
                        kb_id,
                        doc_id,
                    )
                else:
                    result = await conn.execute(
                        f"DELETE FROM {fq_table} WHERE metadata_->>'kb_id' = $1",
                        kb_id,
                    )
                count = int(result.split(" ")[-1]) if result else 0
                total_deleted += count
                logger.info(
                    "Deleted %d vectors from %s (kb_id=%s, doc_id=%s)",
                    count,
                    fq_table,
                    kb_id,
                    doc_id,
                )
            except asyncpg.UndefinedTableError:
                logger.debug("Table %s does not exist yet, skipping.", fq_table)
    finally:
        await conn.close()
    return total_deleted
