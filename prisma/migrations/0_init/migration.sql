-- Initial schema baseline — fully idempotent (safe to run on existing databases).
-- Uses IF NOT EXISTS so it is a no-op when tables already exist (Neon/db push DBs).

CREATE TABLE IF NOT EXISTS "Search" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "aiModel" TEXT NOT NULL DEFAULT 'groq-llama-3.3-70b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Search_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL DEFAULT '',
    "dailyLimit" INTEGER NOT NULL DEFAULT -1,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "patentabilityMd" TEXT NOT NULL,
    "clientReportMd" TEXT NOT NULL,
    "referencesFound" INTEGER NOT NULL DEFAULT 0,
    "patentabilityRating" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserOverride_userId_key" ON "UserOverride"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Report_searchId_key" ON "Report"("searchId");

-- Foreign key (idempotent via DO block)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Report_searchId_fkey'
    ) THEN
        ALTER TABLE "Report" ADD CONSTRAINT "Report_searchId_fkey"
            FOREIGN KEY ("searchId") REFERENCES "Search"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
