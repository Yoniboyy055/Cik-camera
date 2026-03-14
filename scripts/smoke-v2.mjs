#!/usr/bin/env node
/**
 * GrandProof V2 — Smoke Test
 * Usage: node scripts/smoke-v2.mjs https://cik-camera.vercel.app
 *
 * Tests the full worker flow:
 *   register → login → projects/templates → create package → upload capture
 *   (with GPS + hash fields) → patch status → verify capture appears
 */

import { createHash } from 'node:crypto';

const BASE = process.argv[2]?.replace(/\/$/, '') || 'http://localhost:5173';
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let failCount = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
  } else {
    console.error(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ''}`);
    failCount++;
  }
}

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, ok: res.ok, json };
}

// ─── Minimal 1×1 pixel JPEG as base64 data URL ───────────────────────────────
const TINY_JPEG =
  'data:image/jpeg;base64,' +
  '/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAB' +
  'AAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/' +
  'xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A' +
  'LBAD/9k=';

// SHA-256 of the raw binary behind the data URL
function sha256OfDataUrl(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const buf = Buffer.from(b64, 'base64');
  return createHash('sha256').update(buf).digest('hex');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const email = `smoke+${Date.now()}@grandproof.test`;
const password = 'Smoke!test1';
let token;
let projectId;
let templateId;
let packageId;
let captureId;

console.log(`\nGrandProof V2 Smoke Test — ${BASE}\n`);

// 1. Register
console.log('1. Register');
{
  const r = await req('POST', '/api/register', { email, password });
  assert('HTTP 200 or 201', r.status === 200 || r.status === 201, `got ${r.status}`);
  assert('returns token', !!r.json?.token, JSON.stringify(r.json));
  token = r.json?.token;
}

if (!token) {
  // Try logging in with existing test account (idempotent re-runs)
  console.log('  → no token from register; trying login');
  const r = await req('POST', '/api/login', { email, password });
  token = r.json?.token;
}

if (!token) {
  console.error(`  ${FAIL} Cannot obtain auth token — aborting`);
  process.exit(1);
}

// 2. Health
console.log('2. Health');
{
  const r = await req('GET', '/api/health');
  assert('HTTP 200', r.ok, `got ${r.status}`);
}

// 3. Projects
console.log('3. Projects');
{
  const r = await req('GET', '/api/projects', null, token);
  assert('HTTP 200', r.ok, `got ${r.status}`);
  assert('returns array', Array.isArray(r.json), JSON.stringify(r.json));
  projectId = r.json?.[0]?.id ?? null;
  assert('at least one project', !!projectId);
}

// 4. Task templates
console.log('4. Task templates');
{
  const r = await req('GET', '/api/task-templates', null, token);
  assert('HTTP 200', r.ok, `got ${r.status}`);
  assert('returns array', Array.isArray(r.json), JSON.stringify(r.json));
  templateId = r.json?.[0]?.id ?? null;
}

// 5. Create capture package
console.log('5. Create capture package');
{
  const r = await req(
    'POST',
    '/api/capture-packages',
    {
      project_id: projectId,
      task_template_id: templateId ?? null,
      custom_task_text: 'Smoke test task',
    },
    token,
  );
  assert('HTTP 200 or 201', r.status === 200 || r.status === 201, `got ${r.status}`);
  assert('returns id', !!r.json?.id, JSON.stringify(r.json));
  packageId = r.json?.id;
}

if (!packageId) {
  console.error(`  ${FAIL} Cannot obtain package ID — aborting`);
  process.exit(1);
}

// 6. Upload capture (with GPS + integrity fields)
console.log('6. Upload capture');
{
  const sha = sha256OfDataUrl(TINY_JPEG);
  const r = await req(
    'POST',
    '/api/captures',
    {
      project_id: projectId,
      package_id: packageId,
      latitude: 32.08088,
      longitude: 34.78057,
      gps_accuracy_m: 5.2,
      altitude_m: 38.1,
      note: 'Smoke test capture',
      evidence_sha256: sha,
      capture_source: 'worker',
      photo_data: TINY_JPEG,
    },
    token,
  );
  assert('HTTP 200 or 201', r.status === 200 || r.status === 201, `got ${r.status}`);
  assert('returns id', !!r.json?.id, JSON.stringify(r.json));
  captureId = r.json?.id;

  // Verify integrity fields were persisted
  if (r.json?.evidence_sha256 !== undefined) {
    assert('evidence_sha256 persisted', r.json.evidence_sha256 === sha);
  }
  if (r.json?.gps_accuracy_m !== undefined) {
    assert('gps_accuracy_m persisted', r.json.gps_accuracy_m === 5.2);
  }
}

// 7. Patch package status → submitted
console.log('7. Patch package status → submitted');
{
  const r = await req(
    'PATCH',
    `/api/packages/${packageId}/status`,
    { status: 'submitted' },
    token,
  );
  assert('HTTP 200', r.ok, `got ${r.status}`);
}

// 8. Verify capture appears in GET /api/captures
console.log('8. Verify capture retrievable');
{
  const r = await req('GET', `/api/captures?package_id=${packageId}`, null, token);
  assert('HTTP 200', r.ok, `got ${r.status}`);
  if (Array.isArray(r.json)) {
    assert('capture present in list', r.json.some((c) => c.id === captureId));
  } else {
    assert('returns array', false, JSON.stringify(r.json));
  }
}

// 9. Summary
console.log('\n─────────────────────────────────────────');
if (failCount === 0) {
  console.log(`${PASS} All checks passed\n`);
} else {
  console.error(`${FAIL} ${failCount} check(s) failed\n`);
  process.exit(1);
}
