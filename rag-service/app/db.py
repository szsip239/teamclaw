"""
Async Postgres connection pool + schema bootstrap.

Replaces the LlamaIndex PGVectorStore. Owns a single asyncpg.Pool for the
service lifetime. Migration SQL lives in rag-service/migrations/ and is run
once at startup (idempotent via CREATE ... IF NOT EXISTS).
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import asyncpg

from app.config import DATABASE_URL, PGVECTOR_EMBED_DIM

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _normalize_dsn(dsn: str) -> str:
    """Strip Prisma-style ?schema=... and convert postgres:// → postgresql://."""
    if not dsn:
        return dsn
    if dsn.startswith("postgres://"):
        dsn = "postgresql://" + dsn[len("postgres://"):]
    # asyncpg does not understand ?schema= (it's a Prisma extension).
    if "?" in dsn:
        head, query = dsn.split("?", 1)
        kept = "&".join(p for p in query.split("&") if not p.startswith("schema="))
        dsn = f"{head}?{kept}" if kept else head
    return dsn


async def init_pool(min_size: int = 2, max_size: int = 10) -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured")
    dsn = _normalize_dsn(DATABASE_URL)
    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=min_size,
        max_size=max_size,
        command_timeout=60,
    )
    logger.info("asyncpg pool created (min=%d max=%d, embed_dim=%d)",
                min_size, max_size, PGVECTOR_EMBED_DIM)
    return _pool


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized — call init_pool() at startup")
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def run_migrations() -> None:
    """Apply every *.sql in migrations/ in lexical order. Idempotent."""
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        logger.warning("No migration files found at %s", MIGRATIONS_DIR)
        return
    async with pool().acquire() as conn:
        for path in files:
            sql = path.read_text(encoding="utf-8")
            # asyncpg cannot execute multiple statements with prepared protocol;
            # use simple-query protocol via execute on the raw connection.
            await conn.execute(sql)
            logger.info("applied migration %s", path.name)


# ── Vector helpers ───────────────────────────────────────────────────

def vector_to_pg(vec: list[float] | None) -> str | None:
    """Encode a Python list as the pgvector textual literal '[v1,v2,...]'."""
    if vec is None:
        return None
    return "[" + ",".join(f"{float(v):.7f}" for v in vec) + "]"
