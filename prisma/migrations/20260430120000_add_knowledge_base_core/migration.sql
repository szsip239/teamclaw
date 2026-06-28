-- Backfill the knowledge-base core schema before later migrations add
-- categories, chat mounts, and regulation trackers.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KbScope') THEN
    CREATE TYPE "KbScope" AS ENUM ('GLOBAL', 'DEPARTMENT', 'PERSONAL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentStatus') THEN
    CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "KnowledgeBase" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "scope" "KbScope" NOT NULL DEFAULT 'PERSONAL',
  "departmentId" TEXT,
  "createdById" TEXT NOT NULL,
  "documentCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KbConversation" (
  "id" TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '新对话',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KbConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KbMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "reasoning" TEXT,
  "answerSourcesJson" JSONB,
  "answerAssetsJson" JSONB,
  "retrievalGroupsJson" JSONB,
  "stage" TEXT,
  "error" BOOLEAN NOT NULL DEFAULT false,
  "stopped" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KbMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
  "id" TEXT NOT NULL,
  "knowledgeBaseId" TEXT NOT NULL,
  "docId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "pageCount" INTEGER,
  "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
  "jobId" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KnowledgeBase_scope_idx" ON "KnowledgeBase"("scope");
CREATE INDEX IF NOT EXISTS "KnowledgeBase_departmentId_idx" ON "KnowledgeBase"("departmentId");
CREATE INDEX IF NOT EXISTS "KnowledgeBase_createdById_idx" ON "KnowledgeBase"("createdById");
CREATE INDEX IF NOT EXISTS "KbConversation_knowledgeBaseId_userId_updatedAt_idx" ON "KbConversation"("knowledgeBaseId", "userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "KbMessage_conversationId_createdAt_idx" ON "KbMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_knowledgeBaseId_idx" ON "KnowledgeDocument"("knowledgeBaseId");
CREATE INDEX IF NOT EXISTS "KnowledgeDocument_status_idx" ON "KnowledgeDocument"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeBase_departmentId_fkey') THEN
    ALTER TABLE "KnowledgeBase"
    ADD CONSTRAINT "KnowledgeBase_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeBase_createdById_fkey') THEN
    ALTER TABLE "KnowledgeBase"
    ADD CONSTRAINT "KnowledgeBase_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KbConversation_knowledgeBaseId_fkey') THEN
    ALTER TABLE "KbConversation"
    ADD CONSTRAINT "KbConversation_knowledgeBaseId_fkey"
    FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KbConversation_userId_fkey') THEN
    ALTER TABLE "KbConversation"
    ADD CONSTRAINT "KbConversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KbMessage_conversationId_fkey') THEN
    ALTER TABLE "KbMessage"
    ADD CONSTRAINT "KbMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "KbConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeDocument_knowledgeBaseId_fkey') THEN
    ALTER TABLE "KnowledgeDocument"
    ADD CONSTRAINT "KnowledgeDocument_knowledgeBaseId_fkey"
    FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
