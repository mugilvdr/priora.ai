-- Add error tracking, jurisdiction mode, query log, and admin audit log.
-- Fully idempotent: ADD COLUMN IF NOT EXISTS is safe on existing databases.

ALTER TABLE "Search" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "Search" ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT NOT NULL DEFAULT 'US';
ALTER TABLE "Search" ADD COLUMN IF NOT EXISTS "queryLog" TEXT;

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "targetUserId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
