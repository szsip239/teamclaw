"""Delete RAG data for a KB or specific doc — SQL-level cascade."""

from __future__ import annotations

import logging

from app.config import RequestCredentials
from app.storage import delete_kb_or_doc

logger = logging.getLogger(__name__)


async def delete_vectors(
    kb_id: str,
    doc_id: str | None,
    creds: RequestCredentials,  # noqa: ARG001 — kept for signature compatibility
) -> int:
    """Delete all RAG rows for kb_id (+ optional doc_id). Returns deleted count."""
    deleted = await delete_kb_or_doc(kb_id=kb_id, doc_id=doc_id)
    logger.info("deleted %d row(s) — kb=%s doc=%s", deleted, kb_id, doc_id)
    return deleted
