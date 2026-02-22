-- DropIndex
DROP INDEX "ChatSession_userId_instanceId_agentId_key";

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ChatMessageSnapshot" (
    "id" TEXT NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "thinking" TEXT,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessageSnapshot_chatSessionId_batchId_idx" ON "ChatMessageSnapshot"("chatSessionId", "batchId");

-- CreateIndex
CREATE INDEX "ChatSession_userId_instanceId_agentId_idx" ON "ChatSession"("userId", "instanceId", "agentId");

-- AddForeignKey
ALTER TABLE "ChatMessageSnapshot" ADD CONSTRAINT "ChatMessageSnapshot_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
