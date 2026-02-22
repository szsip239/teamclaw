-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('DEFAULT', 'DEPARTMENT', 'PERSONAL');

-- CreateEnum
CREATE TYPE "SkillSource" AS ENUM ('LOCAL', 'CLAWHUB');

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "homepage" TEXT,
    "category" "SkillCategory" NOT NULL DEFAULT 'DEFAULT',
    "source" "SkillSource" NOT NULL DEFAULT 'LOCAL',
    "clawhubSlug" TEXT,
    "version" TEXT NOT NULL DEFAULT '0.1.0',
    "creatorId" TEXT NOT NULL,
    "departmentId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frontmatter" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillVersion" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillInstallation" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "installedVersion" TEXT NOT NULL,
    "installPath" TEXT NOT NULL,
    "installedById" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE INDEX "Skill_category_idx" ON "Skill"("category");

-- CreateIndex
CREATE INDEX "Skill_creatorId_idx" ON "Skill"("creatorId");

-- CreateIndex
CREATE INDEX "Skill_departmentId_idx" ON "Skill"("departmentId");

-- CreateIndex
CREATE INDEX "Skill_source_idx" ON "Skill"("source");

-- CreateIndex
CREATE INDEX "SkillVersion_skillId_idx" ON "SkillVersion"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillVersion_skillId_version_key" ON "SkillVersion"("skillId", "version");

-- CreateIndex
CREATE INDEX "SkillInstallation_skillId_idx" ON "SkillInstallation"("skillId");

-- CreateIndex
CREATE INDEX "SkillInstallation_instanceId_agentId_idx" ON "SkillInstallation"("instanceId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillInstallation_skillId_instanceId_agentId_key" ON "SkillInstallation"("skillId", "instanceId", "agentId");

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillVersion" ADD CONSTRAINT "SkillVersion_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillVersion" ADD CONSTRAINT "SkillVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillInstallation" ADD CONSTRAINT "SkillInstallation_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillInstallation" ADD CONSTRAINT "SkillInstallation_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillInstallation" ADD CONSTRAINT "SkillInstallation_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
