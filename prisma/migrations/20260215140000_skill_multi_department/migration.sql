-- CreateTable: implicit many-to-many join table for Skill <-> Department
CREATE TABLE "_DepartmentToSkill" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_DepartmentToSkill_A_fkey" FOREIGN KEY ("A") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_DepartmentToSkill_B_fkey" FOREIGN KEY ("B") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_DepartmentToSkill_AB_unique" ON "_DepartmentToSkill"("A", "B");

-- CreateIndex
CREATE INDEX "_DepartmentToSkill_B_index" ON "_DepartmentToSkill"("B");

-- Migrate existing data: copy departmentId relationships to join table
INSERT INTO "_DepartmentToSkill" ("A", "B")
SELECT "departmentId", "id" FROM "Skill" WHERE "departmentId" IS NOT NULL;

-- DropIndex
DROP INDEX IF EXISTS "Skill_departmentId_idx";

-- AlterTable: remove old departmentId column
ALTER TABLE "Skill" DROP COLUMN "departmentId";
