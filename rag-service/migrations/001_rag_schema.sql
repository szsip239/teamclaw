-- ============================================================
-- TeamClaw RAG Service — Schema bootstrap
-- Replaces LlamaIndex PGVectorStore tables with a hybrid
-- (FTS via tsvector + dense vectors via pgvector) layout.
-- All RAG-internal tables live under the `rag` schema, isolated
-- from TeamClaw's business tables (User / KnowledgeBase / etc.).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS rag;
CREATE EXTENSION IF NOT EXISTS vector;

-- ── PDF: per-page OCR ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag.page_ocr (
    id           BIGSERIAL PRIMARY KEY,
    kb_id        TEXT      NOT NULL,
    doc_id       TEXT      NOT NULL,
    page_index   INT       NOT NULL,
    text         TEXT      NOT NULL,
    text_tokens  TEXT      NOT NULL,            -- jieba-tokenized, whitespace-joined
    tsv          tsvector  GENERATED ALWAYS AS (to_tsvector('simple', text_tokens)) STORED,
    embedding    vector(1024),
    metadata     JSONB     NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (kb_id, doc_id, page_index)
);
CREATE INDEX IF NOT EXISTS page_ocr_kb_doc_idx  ON rag.page_ocr (kb_id, doc_id);
CREATE INDEX IF NOT EXISTS page_ocr_tsv_gin_idx ON rag.page_ocr USING GIN (tsv);
CREATE INDEX IF NOT EXISTS page_ocr_emb_hnsw_idx
    ON rag.page_ocr USING hnsw (embedding vector_cosine_ops);

-- ── Document-level profile (summary + keywords + routing vector) ─
CREATE TABLE IF NOT EXISTS rag.doc_profile (
    kb_id           TEXT     NOT NULL,
    doc_id          TEXT     NOT NULL,
    file_name       TEXT     NOT NULL,
    file_type       TEXT     NOT NULL CHECK (file_type IN ('pdf', 'excel')),
    page_count      INT,
    profile_status  TEXT     NOT NULL DEFAULT 'pending',
    profile_detail  TEXT     NOT NULL DEFAULT '',
    summary         TEXT,
    doc_type        TEXT     NOT NULL DEFAULT '',
    summary_tokens  TEXT     NOT NULL DEFAULT '',
    keywords        TEXT[]   NOT NULL DEFAULT '{}',
    title_aliases   TEXT[]   NOT NULL DEFAULT '{}',
    route_text      TEXT     NOT NULL DEFAULT '',
    chapter_summary TEXT     NOT NULL DEFAULT '',
    tsv             tsvector GENERATED ALWAYS AS (to_tsvector('simple', summary_tokens)) STORED,
    embedding       vector(1024),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (kb_id, doc_id)
);
CREATE INDEX IF NOT EXISTS doc_profile_kb_idx      ON rag.doc_profile (kb_id);
CREATE INDEX IF NOT EXISTS doc_profile_tsv_gin_idx ON rag.doc_profile USING GIN (tsv);
CREATE INDEX IF NOT EXISTS doc_profile_emb_hnsw_idx
    ON rag.doc_profile USING hnsw (embedding vector_cosine_ops);

-- ── Excel: row-level policy + ingest config ──────────────────
CREATE TABLE IF NOT EXISTS rag.excel_policy (
    id          BIGSERIAL PRIMARY KEY,
    kb_id       TEXT NOT NULL,
    doc_id      TEXT NOT NULL,
    source_row  INT  NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (kb_id, doc_id, source_row)
);
CREATE INDEX IF NOT EXISTS excel_policy_kb_doc_idx ON rag.excel_policy (kb_id, doc_id);

CREATE TABLE IF NOT EXISTS rag.excel_policy_chunk (
    id                  BIGSERIAL PRIMARY KEY,
    kb_id               TEXT   NOT NULL,
    doc_id              TEXT   NOT NULL,
    policy_id           BIGINT NOT NULL REFERENCES rag.excel_policy(id) ON DELETE CASCADE,
    chunk_index         INT    NOT NULL,
    chunk_text          TEXT   NOT NULL,
    search_text         TEXT   NOT NULL,
    search_text_tokens  TEXT   NOT NULL,
    tsv                 tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_text_tokens)) STORED,
    embedding           vector(1024),
    UNIQUE (policy_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS excel_chunk_kb_doc_idx  ON rag.excel_policy_chunk (kb_id, doc_id);
CREATE INDEX IF NOT EXISTS excel_chunk_tsv_gin_idx ON rag.excel_policy_chunk USING GIN (tsv);
CREATE INDEX IF NOT EXISTS excel_chunk_emb_hnsw_idx
    ON rag.excel_policy_chunk USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS rag.excel_config (
    kb_id      TEXT NOT NULL,
    doc_id     TEXT NOT NULL,
    config     JSONB NOT NULL,
    row_count  INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (kb_id, doc_id)
);
