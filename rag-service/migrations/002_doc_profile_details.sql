-- Extend document profiles to match the richer llm-rag index metadata.
-- This migration is intentionally idempotent because the dev service runs
-- all migration files on startup.

ALTER TABLE rag.doc_profile
    ADD COLUMN IF NOT EXISTS profile_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS profile_detail TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS title_aliases TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS route_text TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS chapter_summary TEXT NOT NULL DEFAULT '';

UPDATE rag.doc_profile
SET profile_status = 'done',
    profile_detail = '文档画像已生成，可参与多文档路由。',
    route_text = concat_ws(E'\n', file_name, summary, array_to_string(keywords, ' '))
WHERE profile_status = 'pending'
  AND COALESCE(summary, '') <> '';
