-- Align regulation tracker storage with the current Prisma schema.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PendingStatus') THEN
    CREATE TYPE "PendingStatus" AS ENUM ('NEW', 'SEEN', 'APPLIED', 'DISMISSED');
  END IF;
END $$;

ALTER TABLE "RegulationTracker"
ADD COLUMN IF NOT EXISTS "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "notifyChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "searchCron" TEXT,
ADD COLUMN IF NOT EXISTS "lastCheckRunAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PendingUpdate" (
  "id" TEXT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'web_search',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "suggestion" TEXT,
  "matchedKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "PendingStatus" NOT NULL DEFAULT 'NEW',
  "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),

  CONSTRAINT "PendingUpdate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PendingUpdate_trackerId_sourceUrl_key" ON "PendingUpdate"("trackerId", "sourceUrl");
CREATE INDEX IF NOT EXISTS "PendingUpdate_trackerId_status_idx" ON "PendingUpdate"("trackerId", "status");
CREATE INDEX IF NOT EXISTS "PendingUpdate_status_foundAt_idx" ON "PendingUpdate"("status", "foundAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PendingUpdate_trackerId_fkey') THEN
    ALTER TABLE "PendingUpdate"
    ADD CONSTRAINT "PendingUpdate_trackerId_fkey"
    FOREIGN KEY ("trackerId") REFERENCES "RegulationTracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
