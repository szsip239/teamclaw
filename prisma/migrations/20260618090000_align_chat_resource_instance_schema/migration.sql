-- Add schema fields introduced after the original chat/resource migrations.

ALTER TYPE "InstanceStatus" ADD VALUE IF NOT EXISTS 'INITIALIZING';
ALTER TYPE "SkillSource" ADD VALUE IF NOT EXISTS 'INSTANCE';

ALTER TABLE "Resource"
ADD COLUMN IF NOT EXISTS "isDefaultModel" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ChatSession"
ADD COLUMN IF NOT EXISTS "conversationGroupId" TEXT,
ADD COLUMN IF NOT EXISTS "gwSessionId" TEXT,
ADD COLUMN IF NOT EXISTS "liveMessages" JSONB;

ALTER TABLE "ChatSession"
DROP COLUMN IF EXISTS "mountedKbIds";

CREATE INDEX IF NOT EXISTS "ChatSession_conversationGroupId_idx" ON "ChatSession"("conversationGroupId");
