#!/usr/bin/env node
/**
 * Vercel build entry point.
 * Sets DIRECT_URL fallback (Neon uses a single URL for both),
 * runs migrations, then runs Next.js build — all in one process tree
 * so the env var is inherited by every child.
 */

'use strict';
const { spawnSync } = require('child_process');

// Neon (and similar) uses the same URL for pooled and direct connections.
// If DIRECT_URL is not explicitly configured, fall back to DATABASE_URL
// so Prisma schema validation never fails on this variable.
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  console.log('→ DIRECT_URL not set — using DATABASE_URL as fallback');
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}

run('node', ['scripts/migrate-deploy.js']);
run('npx', ['next', 'build']);
