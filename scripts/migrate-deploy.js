#!/usr/bin/env node
/**
 * Smart migration runner for Vercel builds.
 *
 * Problem: existing Neon DB was set up with `prisma db push` — tables exist but
 * no `_prisma_migrations` table. `prisma migrate deploy` throws P3005 and refuses
 * to proceed on a non-empty DB without migration history.
 *
 * Fix: catch P3005, baseline the 0_init migration (marks it as already applied
 * without re-running it), then retry `prisma migrate deploy` which will only apply
 * migrations added after the baseline (migration 1 onwards).
 *
 * NOTE: Uses spawnSync with stdio:'pipe' so we can inspect stderr for P3005.
 * Output is forwarded manually so it still appears in the Vercel build log.
 */

const { spawnSync } = require('child_process');

function spawn(args) {
  const result = spawnSync('npx', args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function migrateDeploy() {
  return spawn(['prisma', 'migrate', 'deploy']);
}

function migrateResolve(migrationName) {
  return spawn(['prisma', 'migrate', 'resolve', '--applied', migrationName]);
}

console.log('→ Running prisma migrate deploy…');
let result = migrateDeploy();

if (result.status !== 0) {
  const output = (result.stdout || '') + (result.stderr || '');
  const isP3005 = output.includes('P3005') || output.includes('database schema is not empty');

  if (!isP3005) {
    console.error('Migration failed with an unexpected error (not P3005).');
    process.exit(result.status || 1);
  }

  console.log('⚠  P3005: existing DB has no migration history (was created with db push).');
  console.log('→ Baselining 0_init so Prisma knows which migrations have already been applied…');

  const resolveResult = migrateResolve('0_init');
  if (resolveResult.status !== 0) {
    console.error('Failed to baseline 0_init migration.');
    process.exit(resolveResult.status || 1);
  }

  console.log('→ Retrying prisma migrate deploy…');
  result = migrateDeploy();

  if (result.status !== 0) {
    console.error('Migration failed even after baselining.');
    process.exit(result.status || 1);
  }
}

console.log('✓ Migrations complete.');
