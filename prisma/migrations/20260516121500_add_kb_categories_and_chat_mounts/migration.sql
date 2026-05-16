-- Add knowledge-base categories and persisted chat knowledge-base mounts.

CREATE TYPE "KbCategory" AS ENUM ('INTERNAL', 'EXTERNAL', 'RULES');

ALTER TABLE "ChatSession"
ADD COLUMN "mountedKbIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "KnowledgeBase"
ADD COLUMN "category" "KbCategory" NOT NULL DEFAULT 'INTERNAL';

CREATE INDEX "KnowledgeBase_category_idx" ON "KnowledgeBase"("category");
