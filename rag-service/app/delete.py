import logging

import asyncpg

from app.config import DATABASE_URL, RagCredentials

logger = logging.getLogger(__name__)

# llama-index prefixes table names with "data_", so table_name="data_text_chunks"
# becomes "data_data_text_chunks" in the actual schema.
_TABLE = "rag.data_data_text_chunks"


async def delete_vectors(
    kb_id: str, doc_id: str | None, creds: RagCredentials
) -> int:
    """Delete vectors from pgvector by kb_id and optional doc_id."""
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        if doc_id:
            result = await conn.execute(
                f"DELETE FROM {_TABLE} "
                "WHERE metadata_->>'kb_id' = $1 AND metadata_->>'doc_id' = $2",
                kb_id,
                doc_id,
            )
        else:
            result = await conn.execute(
                f"DELETE FROM {_TABLE} WHERE metadata_->>'kb_id' = $1",
                kb_id,
            )
        # asyncpg returns "DELETE N"
        count = int(result.split(" ")[-1]) if result else 0
        logger.info(
            "Deleted %d vectors for kb_id=%s doc_id=%s", count, kb_id, doc_id
        )
        return count
    finally:
        await conn.close()
