-- Add patent source and NPL source tab columns to Report
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "patentSourcesMd" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "nplSourcesMd" TEXT;
