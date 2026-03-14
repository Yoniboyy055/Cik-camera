/**
 * Applies the V2 migration SQL to the live Supabase database.
 * Uses the Supabase service role key from .env.local (pulled via `vercel env pull`).
 *
 * Usage: node scripts/apply-migration.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Minimal .env.local parser (no external deps needed)
function loadEnv(file) {
  try {
    const text = readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  } catch { /* .env.local may not exist */ }
}

loadEnv(resolve(__dir, '../.env.local'));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Run: vercel env pull .env.local');
  process.exit(1);
}

// Individual ALTER TABLE statements (Supabase DDL via SQL API)
const statements = [
  // captures: GPS columns
  "ALTER TABLE captures ADD COLUMN IF NOT EXISTS gps_accuracy_m DOUBLE PRECISION",
  "ALTER TABLE captures ADD COLUMN IF NOT EXISTS altitude_m DOUBLE PRECISION",
  // captures: evidence integrity columns
  "ALTER TABLE captures ADD COLUMN IF NOT EXISTS evidence_sha256 TEXT",
  "ALTER TABLE captures ADD COLUMN IF NOT EXISTS capture_source TEXT DEFAULT 'worker'",
  // capture_packages: rejection reason columns
  "ALTER TABLE capture_packages ADD COLUMN IF NOT EXISTS rejection_reason_code TEXT",
  "ALTER TABLE capture_packages ADD COLUMN IF NOT EXISTS rejection_reason_text TEXT",
  // Audit log table
  `CREATE TABLE IF NOT EXISTS capture_audit_log (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    package_id  TEXT        NOT NULL REFERENCES capture_packages(id) ON DELETE CASCADE,
    actor_id    TEXT        NOT NULL,
    actor_name  TEXT        NOT NULL,
    from_status TEXT,
    to_status   TEXT        NOT NULL,
    reason_code TEXT,
    reason_text TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

async function execSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({}),
  });
  // Supabase doesn't expose a direct SQL endpoint on the free tier REST API.
  // Use the management API or pg endpoint.
  return res;
}

// Use Supabase's pg/sql endpoint (available on all plans)
async function runSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return { status: res.status, body: await res.text() };
}

// Fallback: Supabase RPC for raw SQL (only if pg endpoint not available)
async function runSQLviaRPC(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });
  return { status: res.status, body: await res.text() };
}

console.log(`Applying migration to ${SUPABASE_URL}\n`);

let allOk = true;
for (const stmt of statements) {
  const preview = stmt.slice(0, 60).replace(/\s+/g, ' ');
  process.stdout.write(`  → ${preview}... `);

  // Try pg endpoint first
  let result = await runSQL(stmt);
  if (result.status === 404) {
    // Endpoint not available; try RPC
    result = await runSQLviaRPC(stmt);
  }

  if (result.status >= 200 && result.status < 300) {
    console.log('✓');
  } else {
    console.log(`✗ (${result.status}) ${result.body.slice(0, 200)}`);
    allOk = false;
  }
}

if (!allOk) {
  console.log('\nSome statements failed. Apply manually via Supabase SQL editor:');
  console.log('https://app.supabase.com → SQL editor → paste supabase/migrations/20260313000000_grandproof_v2_core.sql');
  process.exit(1);
} else {
  console.log('\nMigration applied successfully.');
}
