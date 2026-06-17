CREATE TYPE "ChatRuntime" AS ENUM ('OPENCLAW', 'PI');

ALTER TABLE "ChatSession"
ADD COLUMN "runtime" "ChatRuntime" NOT NULL DEFAULT 'OPENCLAW';

CREATE INDEX "ChatSession_userId_instanceId_agentId_runtime_idx"
ON "ChatSession"("userId", "instanceId", "agentId", "runtime");
