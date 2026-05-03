-- Add progressLabel column for live step messages sent to frontend via SSE.
-- Idempotent: safe to run multiple times.
ALTER TABLE "Search" ADD COLUMN IF NOT EXISTS "progressLabel" TEXT;
