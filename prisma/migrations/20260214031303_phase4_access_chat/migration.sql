-- CreateEnum
CREATE TYPE "InstanceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DEGRADED', 'ERROR');

-- CreateTable
CREATE TABLE "Instance" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "gatewayUrl" TEXT NOT NULL,
    "gatewayToken" TEXT NOT NULL,
    "containerId" TEXT,
    "containerName" TEXT,
    "imageName" TEXT NOT NULL DEFAULT 'alpine/openclaw:latest',
    "dockerConfig" JSONB,
    "status" "InstanceStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastHealthCheck" TIMESTAMP(3),
    "healthData" JSONB,
    "version" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceAccess" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "agentIds" JSONB,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Instance_name_key" ON "Instance"("name");

-- CreateIndex
CREATE INDEX "Instance_status_idx" ON "Instance"("status");

-- CreateIndex
CREATE INDEX "Instance_createdById_idx" ON "Instance"("createdById");

-- CreateIndex
CREATE INDEX "InstanceAccess_departmentId_idx" ON "InstanceAccess"("departmentId");

-- CreateIndex
CREATE INDEX "InstanceAccess_instanceId_idx" ON "InstanceAccess"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "InstanceAccess_departmentId_instanceId_key" ON "InstanceAccess"("departmentId", "instanceId");

-- CreateIndex
CREATE INDEX "ChatSession_userId_idx" ON "ChatSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSession_userId_instanceId_agentId_key" ON "ChatSession"("userId", "instanceId", "agentId");

-- AddForeignKey
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceAccess" ADD CONSTRAINT "InstanceAccess_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceAccess" ADD CONSTRAINT "InstanceAccess_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceAccess" ADD CONSTRAINT "InstanceAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
