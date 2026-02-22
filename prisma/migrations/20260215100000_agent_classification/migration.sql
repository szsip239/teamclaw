-- CreateEnum
CREATE TYPE "AgentCategory" AS ENUM ('DEFAULT', 'DEPARTMENT', 'PERSONAL');

-- CreateTable
CREATE TABLE "AgentMeta" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "category" "AgentCategory" NOT NULL DEFAULT 'DEFAULT',
    "departmentId" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMeta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentMeta_instanceId_idx" ON "AgentMeta"("instanceId");

-- CreateIndex
CREATE INDEX "AgentMeta_category_idx" ON "AgentMeta"("category");

-- CreateIndex
CREATE INDEX "AgentMeta_departmentId_idx" ON "AgentMeta"("departmentId");

-- CreateIndex
CREATE INDEX "AgentMeta_ownerId_idx" ON "AgentMeta"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMeta_instanceId_agentId_key" ON "AgentMeta"("instanceId", "agentId");

-- AddForeignKey
ALTER TABLE "AgentMeta" ADD CONSTRAINT "AgentMeta_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMeta" ADD CONSTRAINT "AgentMeta_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMeta" ADD CONSTRAINT "AgentMeta_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMeta" ADD CONSTRAINT "AgentMeta_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
