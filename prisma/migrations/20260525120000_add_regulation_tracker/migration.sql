-- CreateTable
CREATE TABLE "RegulationTracker" (
    "id" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulationTracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegulationTracker_userId_knowledgeBaseId_key" ON "RegulationTracker"("userId", "knowledgeBaseId");

-- CreateIndex
CREATE INDEX "RegulationTracker_userId_idx" ON "RegulationTracker"("userId");

-- CreateIndex
CREATE INDEX "RegulationTracker_knowledgeBaseId_idx" ON "RegulationTracker"("knowledgeBaseId");

-- AddForeignKey
ALTER TABLE "RegulationTracker" ADD CONSTRAINT "RegulationTracker_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulationTracker" ADD CONSTRAINT "RegulationTracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
