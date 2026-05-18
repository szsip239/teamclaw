"""
Async storage layer for the RAG service.

Mirrors the function surface of llm-rag's storage.py so the ported PDF and
Excel pipelines can be moved across with minimal rewiring. Everything is
multi-tenant: every read and write takes a `kb_id` as the first axis.

Tables (defined in migrations/001_rag_schema.sql):
    rag.page_ocr           — per-PDF-page OCR text + vector
    rag.doc_profile        — document summary + keywords (for routing)
    rag.excel_policy       — row-level Excel policy
    rag.excel_policy_chunk — Excel chunk (FTS + vector)
    rag.excel_config       — Excel ingest config (field mapping)
"""

from __future__ import annotations

import json
import re
from typing import Any, Iterable

from app.db import pool, vector_to_pg
from app.fts import build_tsquery


def _normalize_route_token(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9\u4e00-\u9fff]+", "", str(value or "").casefold())
    return normalized.strip()


# ============================================================
# Page (PDF) operations
# ============================================================

async def upsert_page_ocr(
    *,
    kb_id: str,
    doc_id: str,
    page_index: int,
    text: str,
    text_tokens: str,
    embedding: list[float] | None,
    metadata: dict[str, Any] | None = None,
) -> int:
    sql = """
    INSERT INTO rag.page_ocr (kb_id, doc_id, page_index, text, text_tokens, embedding, metadata)
    VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb)
    ON CONFLICT (kb_id, doc_id, page_index) DO UPDATE
      SET text = EXCLUDED.text,
          text_tokens = EXCLUDED.text_tokens,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata
    RETURNING id;
    """
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            sql,
            kb_id,
            doc_id,
            page_index,
            text,
            text_tokens,
            vector_to_pg(embedding),
            json.dumps(metadata or {}, ensure_ascii=False),
        )
        return int(row["id"])


async def search_pages_fts(
    *,
    kb_id: str,
    query_tokens: list[str],
    doc_ids: list[str] | None = None,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    tsquery = build_tsquery(query_tokens, operator="|")
    if not tsquery:
        return []
    if doc_ids:
        sql = """
        SELECT id, doc_id, page_index, text, metadata,
               ts_rank(tsv, to_tsquery('simple', $2)) AS rank
        FROM rag.page_ocr
        WHERE kb_id = $1
          AND doc_id = ANY($3::text[])
          AND tsv @@ to_tsquery('simple', $2)
        ORDER BY rank DESC
        LIMIT $4;
        """
        args = [kb_id, tsquery, doc_ids, top_k]
    else:
        sql = """
        SELECT id, doc_id, page_index, text, metadata,
               ts_rank(tsv, to_tsquery('simple', $2)) AS rank
        FROM rag.page_ocr
        WHERE kb_id = $1
          AND tsv @@ to_tsquery('simple', $2)
        ORDER BY rank DESC
        LIMIT $3;
        """
        args = [kb_id, tsquery, top_k]
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_dict(r) for r in rows]


async def phrase_search_pages(
    *,
    kb_id: str,
    query: str,
    doc_ids: list[str] | None = None,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    phrase = " ".join(str(query or "").split())
    if not phrase:
        return []
    if doc_ids:
        sql = """
        SELECT id, doc_id, page_index, text, metadata, 1.0::float AS rank
        FROM rag.page_ocr
        WHERE kb_id = $1
          AND doc_id = ANY($3::text[])
          AND lower(text) LIKE lower($2)
        ORDER BY page_index
        LIMIT $4;
        """
        args = [kb_id, f"%{phrase}%", doc_ids, top_k]
    else:
        sql = """
        SELECT id, doc_id, page_index, text, metadata, 1.0::float AS rank
        FROM rag.page_ocr
        WHERE kb_id = $1
          AND lower(text) LIKE lower($2)
        ORDER BY page_index
        LIMIT $3;
        """
        args = [kb_id, f"%{phrase}%", top_k]
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_dict(r) for r in rows]


async def search_pages_vector(
    *,
    kb_id: str,
    embedding: list[float],
    doc_ids: list[str] | None = None,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    if not embedding:
        return []
    vec = vector_to_pg(embedding)
    if doc_ids:
        sql = """
        SELECT id, doc_id, page_index, text, metadata,
               1 - (embedding <=> $2::vector) AS score
        FROM rag.page_ocr
        WHERE kb_id = $1
          AND doc_id = ANY($3::text[])
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $2::vector
        LIMIT $4;
        """
        args = [kb_id, vec, doc_ids, top_k]
    else:
        sql = """
        SELECT id, doc_id, page_index, text, metadata,
               1 - (embedding <=> $2::vector) AS score
        FROM rag.page_ocr
        WHERE kb_id = $1
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $2::vector
        LIMIT $3;
        """
        args = [kb_id, vec, top_k]
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_dict(r) for r in rows]


async def get_pages_by_indices(
    *, kb_id: str, doc_id: str, page_indices: Iterable[int]
) -> list[dict[str, Any]]:
    indices = sorted(set(int(i) for i in page_indices))
    if not indices:
        return []
    sql = """
    SELECT id, doc_id, page_index, text, metadata
    FROM rag.page_ocr
    WHERE kb_id = $1 AND doc_id = $2 AND page_index = ANY($3::int[])
    ORDER BY page_index;
    """
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, kb_id, doc_id, indices)
    return [_row_to_dict(r) for r in rows]


async def get_page_ocr_text_map(
    *,
    kb_id: str,
    doc_id: str,
    page_indices: Iterable[int] | None = None,
) -> dict[int, str]:
    indices = sorted(set(int(i) for i in page_indices or []))
    if indices:
        sql = """
        SELECT page_index, text
        FROM rag.page_ocr
        WHERE kb_id = $1 AND doc_id = $2 AND page_index = ANY($3::int[])
        ORDER BY page_index;
        """
        args = [kb_id, doc_id, indices]
    else:
        sql = """
        SELECT page_index, text
        FROM rag.page_ocr
        WHERE kb_id = $1 AND doc_id = $2
        ORDER BY page_index;
        """
        args = [kb_id, doc_id]
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return {int(row["page_index"]): str(row["text"] or "") for row in rows}


# ============================================================
# Document profile (routing)
# ============================================================

async def upsert_doc_profile(
    *,
    kb_id: str,
    doc_id: str,
    file_name: str,
    file_type: str,
    page_count: int | None,
    summary: str,
    summary_tokens: str,
    keywords: list[str],
    embedding: list[float] | None,
    profile_status: str = "done",
    profile_detail: str = "文档画像已生成，可参与多文档路由。",
    doc_type: str = "",
    title_aliases: list[str] | None = None,
    route_text: str = "",
    chapter_summary: str = "",
) -> None:
    sql = """
    INSERT INTO rag.doc_profile
      (kb_id, doc_id, file_name, file_type, page_count, profile_status,
       profile_detail, summary, doc_type, summary_tokens, keywords,
       title_aliases, route_text, chapter_summary, embedding, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::vector, now())
    ON CONFLICT (kb_id, doc_id) DO UPDATE SET
      file_name      = EXCLUDED.file_name,
      file_type      = EXCLUDED.file_type,
      page_count     = EXCLUDED.page_count,
      profile_status = EXCLUDED.profile_status,
      profile_detail = EXCLUDED.profile_detail,
      summary        = EXCLUDED.summary,
      doc_type       = EXCLUDED.doc_type,
      summary_tokens = EXCLUDED.summary_tokens,
      keywords       = EXCLUDED.keywords,
      title_aliases  = EXCLUDED.title_aliases,
      route_text     = EXCLUDED.route_text,
      chapter_summary = EXCLUDED.chapter_summary,
      embedding      = EXCLUDED.embedding,
      updated_at     = now();
    """
    async with pool().acquire() as conn:
        await conn.execute(
            sql, kb_id, doc_id, file_name, file_type, page_count,
            profile_status, profile_detail, summary, doc_type,
            summary_tokens, keywords, title_aliases or [], route_text,
            chapter_summary, vector_to_pg(embedding),
        )


async def get_document_index_info(*, kb_id: str, doc_id: str) -> dict[str, Any]:
    profile_sql = """
    SELECT kb_id, doc_id, profile_status, profile_detail, summary, doc_type,
           keywords, title_aliases, chapter_summary, page_count, updated_at
    FROM rag.doc_profile
    WHERE kb_id = $1 AND doc_id = $2;
    """
    stats_sql = """
    SELECT
      count(*)::int AS index_row_count,
      count(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded_row_count,
      count(DISTINCT CASE
        WHEN metadata ? 'display_page' THEN (metadata->>'display_page')::int
        ELSE page_index + 1
      END)::int AS indexed_page_count
    FROM rag.page_ocr
    WHERE kb_id = $1 AND doc_id = $2;
    """
    async with pool().acquire() as conn:
        profile = await conn.fetchrow(profile_sql, kb_id, doc_id)
        stats = await conn.fetchrow(stats_sql, kb_id, doc_id)

    payload: dict[str, Any] = {
        "kb_id": kb_id,
        "doc_id": doc_id,
        "profile_status": "pending",
        "profile_detail": "",
        "summary": "",
        "doc_type": "",
        "keywords": [],
        "title_aliases": [],
        "chapter_summary": "",
        "page_count": None,
        "indexed_page_count": int(stats["indexed_page_count"] or 0) if stats else 0,
        "index_row_count": int(stats["index_row_count"] or 0) if stats else 0,
        "embedded_row_count": int(stats["embedded_row_count"] or 0) if stats else 0,
        "updated_at": None,
    }
    if profile:
        payload.update({
            "profile_status": profile["profile_status"] or "pending",
            "profile_detail": profile["profile_detail"] or "",
            "summary": profile["summary"] or "",
            "doc_type": profile["doc_type"] or "",
            "keywords": list(profile["keywords"] or []),
            "title_aliases": list(profile["title_aliases"] or []),
            "chapter_summary": profile["chapter_summary"] or "",
            "page_count": profile["page_count"],
            "updated_at": profile["updated_at"].isoformat() if profile["updated_at"] else None,
        })
    return payload


async def get_doc_profiles_bulk(
    *, kb_id: str, doc_ids: list[str],
) -> dict[str, dict[str, Any]]:
    """Lightweight bulk fetch for the answer-building pipeline.

    Returns a {doc_id: {file_name, chapter_summary, summary, doc_type,
    keywords, title_aliases, page_count}} map.
    """
    if not doc_ids:
        return {}
    sql = """
    SELECT doc_id, file_name, chapter_summary, summary, doc_type,
           keywords, title_aliases, page_count
    FROM rag.doc_profile
    WHERE kb_id = $1 AND doc_id = ANY($2);
    """
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, kb_id, doc_ids)
    return {
        r["doc_id"]: {
            "file_name": r["file_name"] or "",
            "chapter_summary": r["chapter_summary"] or "",
            "summary": r["summary"] or "",
            "doc_type": r["doc_type"] or "",
            "keywords": list(r["keywords"] or []),
            "title_aliases": list(r["title_aliases"] or []),
            "page_count": r["page_count"],
        }
        for r in rows
    }


async def route_documents(
    *,
    kb_id: str,
    question: str = "",
    query_tokens: list[str],
    embedding: list[float] | None,
    top_n: int = 4,
) -> list[dict[str, Any]]:
    """Pick the top-N candidate documents in a KB by combined FTS + vector score.

    Returns rows with: doc_id, file_name, file_type, fts_rank, vec_score.
    """
    explicit_matches = await _find_explicit_document_matches(
        kb_id=kb_id, question=question, top_n=top_n,
    )
    if explicit_matches:
        return explicit_matches

    tsquery = build_tsquery(query_tokens, operator="|") if query_tokens else ""
    vec = vector_to_pg(embedding) if embedding else None

    if tsquery and vec:
        sql = """
        SELECT doc_id, file_name, file_type,
               COALESCE(ts_rank(tsv, to_tsquery('simple', $2)), 0) AS fts_rank,
               CASE WHEN embedding IS NULL THEN 0
                    ELSE 1 - (embedding <=> $3::vector) END AS vec_score
        FROM rag.doc_profile
        WHERE kb_id = $1 AND profile_status = 'done'
        ORDER BY (COALESCE(ts_rank(tsv, to_tsquery('simple', $2)), 0)
                  + CASE WHEN embedding IS NULL THEN 0
                         ELSE 1 - (embedding <=> $3::vector) END) DESC
        LIMIT $4;
        """
        args = [kb_id, tsquery, vec, top_n]
    elif vec:
        sql = """
        SELECT doc_id, file_name, file_type,
               0::float AS fts_rank,
               CASE WHEN embedding IS NULL THEN 0
                    ELSE 1 - (embedding <=> $2::vector) END AS vec_score
        FROM rag.doc_profile
        WHERE kb_id = $1 AND profile_status = 'done' AND embedding IS NOT NULL
        ORDER BY embedding <=> $2::vector
        LIMIT $3;
        """
        args = [kb_id, vec, top_n]
    elif tsquery:
        sql = """
        SELECT doc_id, file_name, file_type,
               ts_rank(tsv, to_tsquery('simple', $2)) AS fts_rank,
               0::float AS vec_score
        FROM rag.doc_profile
        WHERE kb_id = $1 AND profile_status = 'done' AND tsv @@ to_tsquery('simple', $2)
        ORDER BY fts_rank DESC
        LIMIT $3;
        """
        args = [kb_id, tsquery, top_n]
    else:
        sql = """
        SELECT doc_id, file_name, file_type, 0::float AS fts_rank, 0::float AS vec_score
        FROM rag.doc_profile WHERE kb_id = $1 AND profile_status = 'done' LIMIT $2;
        """
        args = [kb_id, top_n]

    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, *args)
        if rows:
            return [_row_to_dict(r) for r in rows]
        fallback = await conn.fetch(
            """
            SELECT doc_id, file_name, file_type, 0::float AS fts_rank, 0::float AS vec_score
            FROM rag.doc_profile
            WHERE kb_id = $1
            ORDER BY updated_at DESC
            LIMIT $2;
            """,
            kb_id,
            top_n,
        )
    return [_row_to_dict(r) for r in fallback]


async def _find_explicit_document_matches(
    *, kb_id: str, question: str, top_n: int
) -> list[dict[str, Any]]:
    normalized_question = _normalize_route_token(question)
    if not normalized_question:
        return []
    sql = """
    SELECT doc_id, file_name, file_type, title_aliases,
           1.0::float AS fts_rank, 1.0::float AS vec_score
    FROM rag.doc_profile
    WHERE kb_id = $1 AND profile_status = 'done'
    ORDER BY updated_at DESC;
    """
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, kb_id)

    matches: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        candidates = [str(row["file_name"] or ""), *(row["title_aliases"] or [])]
        for candidate in candidates:
            normalized_candidate = _normalize_route_token(candidate)
            if len(normalized_candidate) < 4:
                continue
            if normalized_candidate in normalized_question and row["doc_id"] not in seen:
                seen.add(str(row["doc_id"]))
                matches.append(_row_to_dict(row))
                break
        if len(matches) >= top_n:
            break
    return matches


async def list_doc_keywords(*, kb_id: str, max_docs: int = 20) -> list[list[str]]:
    sql = """
    SELECT keywords FROM rag.doc_profile
    WHERE kb_id = $1 AND keywords IS NOT NULL
    ORDER BY updated_at DESC LIMIT $2;
    """
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, kb_id, max_docs)
    return [list(r["keywords"]) for r in rows]


# ============================================================
# Excel operations
# ============================================================

async def save_excel_config(*, kb_id: str, doc_id: str, config: dict, row_count: int) -> None:
    sql = """
    INSERT INTO rag.excel_config (kb_id, doc_id, config, row_count)
    VALUES ($1, $2, $3::jsonb, $4)
    ON CONFLICT (kb_id, doc_id) DO UPDATE
      SET config = EXCLUDED.config, row_count = EXCLUDED.row_count;
    """
    async with pool().acquire() as conn:
        await conn.execute(sql, kb_id, doc_id, json.dumps(config, ensure_ascii=False), row_count)


async def get_excel_config(*, kb_id: str, doc_id: str) -> dict | None:
    async with pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT config FROM rag.excel_config WHERE kb_id=$1 AND doc_id=$2",
            kb_id, doc_id,
        )
    if not row:
        return None
    return json.loads(row["config"]) if isinstance(row["config"], str) else dict(row["config"])


async def replace_excel_policies(
    *,
    kb_id: str,
    doc_id: str,
    policies: list[dict[str, Any]],
) -> int:
    """Replace all policies for a doc atomically. Returns the count inserted.

    Each policy: { source_row, title, content, metadata, chunks: [...] }
    Each chunk:  { chunk_index, chunk_text, search_text, search_text_tokens }
    """
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "DELETE FROM rag.excel_policy WHERE kb_id=$1 AND doc_id=$2",
                kb_id, doc_id,
            )
            inserted = 0
            for p in policies:
                policy_row = await conn.fetchrow(
                    """
                    INSERT INTO rag.excel_policy
                      (kb_id, doc_id, source_row, title, content, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                    RETURNING id;
                    """,
                    kb_id, doc_id, int(p["source_row"]), p["title"], p["content"],
                    json.dumps(p.get("metadata") or {}, ensure_ascii=False),
                )
                policy_id = int(policy_row["id"])
                for chunk in p.get("chunks", []):
                    await conn.execute(
                        """
                        INSERT INTO rag.excel_policy_chunk
                          (kb_id, doc_id, policy_id, chunk_index,
                           chunk_text, search_text, search_text_tokens)
                        VALUES ($1, $2, $3, $4, $5, $6, $7);
                        """,
                        kb_id, doc_id, policy_id, int(chunk["chunk_index"]),
                        chunk["chunk_text"], chunk["search_text"],
                        chunk["search_text_tokens"],
                    )
                inserted += 1
            return inserted


async def list_excel_chunks_for_embedding(*, kb_id: str, doc_id: str) -> list[dict[str, Any]]:
    sql = """
    SELECT id AS chunk_id, policy_id, search_text
    FROM rag.excel_policy_chunk
    WHERE kb_id=$1 AND doc_id=$2 AND embedding IS NULL
    ORDER BY policy_id, chunk_index;
    """
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, kb_id, doc_id)
    return [_row_to_dict(r) for r in rows]


async def save_excel_chunk_vector(*, chunk_id: int, embedding: list[float]) -> None:
    async with pool().acquire() as conn:
        await conn.execute(
            "UPDATE rag.excel_policy_chunk SET embedding=$1::vector WHERE id=$2",
            vector_to_pg(embedding), chunk_id,
        )


async def search_excel_policy_chunks(
    *,
    kb_id: str,
    query_tokens: list[str],
    doc_id: str | None = None,
    filters: dict[str, str] | None = None,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    tsquery = build_tsquery(query_tokens, operator="|")
    if not tsquery:
        return []
    clauses = ["c.kb_id = $1", "c.tsv @@ to_tsquery('simple', $2)"]
    args: list[Any] = [kb_id, tsquery]
    if doc_id:
        args.append(doc_id)
        clauses.append(f"c.doc_id = ${len(args)}")
    if filters:
        # JSONB equality on each filter key in policy.metadata
        for key, value in filters.items():
            if not value:
                continue
            args.append(key)
            key_idx = len(args)
            args.append(str(value))
            val_idx = len(args)
            clauses.append(f"(p.metadata->>${key_idx}) = ${val_idx}")
    args.append(top_k)
    limit_idx = len(args)
    sql = f"""
    SELECT c.id AS chunk_id, c.policy_id, c.doc_id, c.chunk_index, c.chunk_text,
           p.source_row, p.title, p.metadata,
           ts_rank(c.tsv, to_tsquery('simple', $2)) AS rank
    FROM rag.excel_policy_chunk c
    JOIN rag.excel_policy p ON p.id = c.policy_id
    WHERE {' AND '.join(clauses)}
    ORDER BY rank DESC
    LIMIT ${limit_idx};
    """
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_dict(r) for r in rows]


async def vector_search_excel_policy_chunks(
    *,
    kb_id: str,
    embedding: list[float],
    doc_id: str | None = None,
    filters: dict[str, str] | None = None,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    if not embedding:
        return []
    vec = vector_to_pg(embedding)
    clauses = ["c.kb_id = $1", "c.embedding IS NOT NULL"]
    args: list[Any] = [kb_id, vec]
    if doc_id:
        args.append(doc_id)
        clauses.append(f"c.doc_id = ${len(args)}")
    if filters:
        for key, value in filters.items():
            if not value:
                continue
            args.append(key)
            key_idx = len(args)
            args.append(str(value))
            val_idx = len(args)
            clauses.append(f"(p.metadata->>${key_idx}) = ${val_idx}")
    args.append(top_k)
    limit_idx = len(args)
    sql = f"""
    SELECT c.id AS chunk_id, c.policy_id, c.doc_id, c.chunk_index, c.chunk_text,
           p.source_row, p.title, p.metadata,
           1 - (c.embedding <=> $2::vector) AS score
    FROM rag.excel_policy_chunk c
    JOIN rag.excel_policy p ON p.id = c.policy_id
    WHERE {' AND '.join(clauses)}
    ORDER BY c.embedding <=> $2::vector
    LIMIT ${limit_idx};
    """
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_dict(r) for r in rows]


async def get_excel_chunks_by_positions(
    *,
    kb_id: str,
    positions: list[tuple[int, int]],
    doc_id: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch chunks at (policy_id, chunk_index) positions, used for neighbor expansion."""
    if not positions:
        return []
    # Build a VALUES clause; asyncpg cannot pass a list of tuples as a single param.
    values_sql = ", ".join(f"(${i*2+2}::bigint, ${i*2+3}::int)" for i in range(len(positions)))
    args: list[Any] = [kb_id]
    for pid, cidx in positions:
        args.append(int(pid))
        args.append(int(cidx))
    doc_filter = ""
    if doc_id:
        args.append(doc_id)
        doc_filter = f"AND c.doc_id = ${len(args)}"
    sql = f"""
    WITH positions(policy_id, chunk_index) AS (VALUES {values_sql})
    SELECT c.id AS chunk_id, c.policy_id, c.doc_id, c.chunk_index, c.chunk_text,
           p.source_row, p.title, p.metadata
    FROM rag.excel_policy_chunk c
    JOIN positions ON positions.policy_id = c.policy_id
                  AND positions.chunk_index = c.chunk_index
    JOIN rag.excel_policy p ON p.id = c.policy_id
    WHERE c.kb_id = $1 {doc_filter}
    ORDER BY c.policy_id, c.chunk_index;
    """
    async with pool().acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [_row_to_dict(r) for r in rows]


async def get_excel_filter_enums(
    *, kb_id: str, doc_id: str | None = None
) -> dict[str, list[str]]:
    """Distinct filter values per filter_field, derived from policy metadata.

    Used by the LLM-based query classifier so it constrains filters to
    values that actually exist.
    """
    config_clause = ""
    args: list[Any] = [kb_id]
    if doc_id:
        args.append(doc_id)
        config_clause = "AND doc_id = $2"
    async with pool().acquire() as conn:
        cfg_rows = await conn.fetch(
            f"SELECT config FROM rag.excel_config WHERE kb_id = $1 {config_clause}",
            *args,
        )
    filter_fields: set[str] = set()
    for r in cfg_rows:
        cfg = r["config"]
        if isinstance(cfg, str):
            cfg = json.loads(cfg)
        for f in cfg.get("filter_fields", []) or []:
            filter_fields.add(f)
    if not filter_fields:
        return {}

    enums: dict[str, list[str]] = {}
    async with pool().acquire() as conn:
        for field in filter_fields:
            sql_args: list[Any] = [kb_id, field]
            doc_filter = ""
            if doc_id:
                sql_args.append(doc_id)
                doc_filter = "AND p.doc_id = $3"
            rows = await conn.fetch(
                f"""
                SELECT DISTINCT p.metadata->>$2 AS value
                FROM rag.excel_policy p
                WHERE p.kb_id = $1 {doc_filter}
                  AND p.metadata->>$2 IS NOT NULL
                  AND p.metadata->>$2 <> ''
                LIMIT 50;
                """,
                *sql_args,
            )
            values = [r["value"] for r in rows if r["value"]]
            if values:
                enums[field] = values
    return enums


# ============================================================
# Cascade delete
# ============================================================

async def delete_kb_or_doc(*, kb_id: str, doc_id: str | None = None) -> int:
    """Delete all RAG data for a KB (doc_id=None) or one doc. Returns affected row count.

    excel_policy_chunk cascades from excel_policy via FK ON DELETE CASCADE.
    """
    total = 0
    async with pool().acquire() as conn:
        async with conn.transaction():
            for table in ("rag.page_ocr", "rag.doc_profile", "rag.excel_config"):
                if doc_id:
                    res = await conn.execute(
                        f"DELETE FROM {table} WHERE kb_id=$1 AND doc_id=$2",
                        kb_id, doc_id,
                    )
                else:
                    res = await conn.execute(
                        f"DELETE FROM {table} WHERE kb_id=$1",
                        kb_id,
                    )
                total += _parse_delete_count(res)

            # excel_policy is the parent of excel_policy_chunk (FK cascade)
            if doc_id:
                res = await conn.execute(
                    "DELETE FROM rag.excel_policy WHERE kb_id=$1 AND doc_id=$2",
                    kb_id, doc_id,
                )
            else:
                res = await conn.execute(
                    "DELETE FROM rag.excel_policy WHERE kb_id=$1",
                    kb_id,
                )
            total += _parse_delete_count(res)
    return total


# ============================================================
# Internals
# ============================================================

def _row_to_dict(row) -> dict[str, Any]:
    """Convert asyncpg.Record → dict, parsing JSONB strings into dicts."""
    d = dict(row)
    for k, v in d.items():
        if isinstance(v, str) and k == "metadata":
            try:
                d[k] = json.loads(v)
            except Exception:
                pass
    return d


def _parse_delete_count(status: str) -> int:
    # asyncpg returns 'DELETE N'
    parts = (status or "").split()
    if len(parts) == 2 and parts[0] == "DELETE":
        try:
            return int(parts[1])
        except ValueError:
            return 0
    return 0
