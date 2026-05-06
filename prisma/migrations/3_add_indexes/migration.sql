-- Add indexes for common query patterns
-- Idempotent: IF NOT EXISTS is safe on re-runs

CREATE INDEX IF NOT EXISTS "Search_userId_createdAt_idx" ON "Search"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Search_status_idx" ON "Search"("status");
CREATE INDEX IF NOT EXISTS "AuditLog_adminId_createdAt_idx" ON "AuditLog"("adminId", "createdAt" DESC);
