-- DropIndex
DROP INDEX IF EXISTS "SkillInstallation_skillId_instanceId_agentId_key";

-- CreateIndex
CREATE UNIQUE INDEX "SkillInstallation_skillId_instanceId_agentId_installPath_key" ON "SkillInstallation"("skillId", "instanceId", "agentId", "installPath");
