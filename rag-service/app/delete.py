import logging

from app.config import RequestCredentials
from app.vector_store_management import delete_kb_vectors

logger = logging.getLogger(__name__)


async def delete_vectors(
    kb_id: str, doc_id: str | None, creds: RequestCredentials
) -> int:
    """Delete vectors from PGVector by kb_id and optional doc_id."""
    return await delete_kb_vectors(kb_id=kb_id, doc_id=doc_id)
