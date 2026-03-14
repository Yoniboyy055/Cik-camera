import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const lines = readFileSync(resolve(__dir, '../.env.local'), 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

const env = loadEnv();
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const ref = 'iwwuhofgzpkkvcbxolxa';

const statements = [
  'ALTER TABLE captures ADD COLUMN IF NOT EXISTS gps_accuracy_m DOUBLE PRECISION',
  'ALTER TABLE captures ADD COLUMN IF NOT EXISTS altitude_m DOUBLE PRECISION',
  'ALTER TABLE captures ADD COLUMN IF NOT EXISTS evidence_sha256 TEXT',
  "ALTER TABLE captures ADD COLUMN IF NOT EXISTS capture_source TEXT DEFAULT 'worker'",
  'ALTER TABLE capture_packages ADD COLUMN IF NOT EXISTS rejection_reason_code TEXT',
  'ALTER TABLE capture_packages ADD COLUMN IF NOT EXISTS rejection_reason_text TEXT',
  `CREATE TABLE IF NOT EXISTS capture_audit_log (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, package_id TEXT NOT NULL REFERENCES capture_packages(id) ON DELETE CASCADE, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL, reason_code TEXT, reason_text TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
];

let allOk = true;
for (const sql of statements) {
  process.stdout.write(`  → ${sql.slice(0, 55)}... `);
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await r.text();
  if (r.status >= 200 && r.status < 300) {
    console.log('✓');
  } else {
    console.log(`✗ (${r.status}) ${body.slice(0, 200)}`);
    allOk = false;
  }
}

console.log(allOk ? '\nDone.' : '\nSome failed — apply manually via Supabase SQL editor.');
process.exit(allOk ? 0 : 1);
