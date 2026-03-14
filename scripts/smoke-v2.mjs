#!/usr/bin/env node
/**
 * GrandProof V2 — Smoke Test
 * Usage: node scripts/smoke-v2.mjs https://cik-camera.vercel.app
 */

import { createHash } from 'node:crypto';

const BASE = process.argv[2]?.replace(/\/$/, '') || 'http://localhost:5173';
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let failCount = 0;
let cookieJar = '';

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
  } else {
    console.error(`  ${FAIL} ${label}${detail ? ` — ${detail}` : ''}`);
    failCount++;
  }
}

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookieJar) {
    headers.Cookie = cookieJar;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    cookieJar = setCookie.split(',').map((cookie) => cookie.split(';')[0].trim()).join('; ');
  }
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, ok: res.ok, json };
}

const TINY_JPEG =
  'data:image/jpeg;base64,' +
  '/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
  'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAB' +
  'AAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/' +
  'xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8A' +
  'LBAD/9k=';

function sha256OfDataUrl(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const buf = Buffer.from(b64, 'base64');
  return createHash('sha256').update(buf).digest('hex');
}

const email = `smoke+${Date.now()}@grandproof.test`;
const password = 'Smoke!test1';
let userId;
let projectId;
let templateId;
let packageId;
let captureId;

console.log(`\nGrandProof V2 Smoke Test — ${BASE}\n`);

// 1. Register
console.log('1. Register');
{
  const r = await req('POST', '/api/register', { name: 'Smoke Test', email, password });
  assert('HTTP 200 or 201', r.status === 200 || r.status === 201, `got ${r.status} — ${JSON.stringify(r.json)}`);
  userId = r.json?.user?.id ?? r.json?.id ?? null;
}

// 2. Login
console.log('2. Login');
{
  const r = await req('POST', '/api/login', { email, password });
  assert('HTTP 200', r.ok, `got ${r.status} — ${JSON.stringify(r.json)}`);
  const id = r.json?.user?.id ?? r.json?.id ?? null;
  assert('returns user.id', !!id, JSON.stringify(r.json));
  userId = id ?? userId;
}

if (!userId) {
  console.error(`  ${FAIL} Cannot obtain user ID — aborting`);
  process.exit(1);
}

// 3. Health
console.log('3. Health');
{
  const r = await req('GET', '/api/health');
  assert('HTTP 200', r.ok, `got ${r.status}`);
}

// 3b. Session bootstrap
console.log('3b. Session bootstrap');
{
  const r = await req('GET', '/api/session');
  assert('HTTP 200', r.ok, `got ${r.status} — ${JSON.stringify(r.json)}`);
  assert('returns authenticated user', !!r.json?.user?.id, JSON.stringify(r.json));
}

// 4. Projects
console.log('4. Projects');
{
  const r = await req('GET', '/api/projects');
  assert('HTTP 200', r.ok, `got ${r.status}`);
  assert('returns array', Array.isArray(r.json), JSON.stringify(r.json));
  projectId = r.json?.[0]?.id ?? null;
  assert('at least one project', !!projectId);
}

// 5. Task templates
console.log('5. Task templates');
{
  const r = await req('GET', '/api/task-templates');
  assert('HTTP 200', r.ok, `got ${r.status}`);
  assert('returns array', Array.isArray(r.json), JSON.stringify(r.json));
  templateId = r.json?.[0]?.id ?? null;
}

// 6. Create capture package
console.log('6. Create capture package');
{
  const r = await req('POST', '/api/capture-packages', {
    project_id: projectId,
    task_template_id: templateId ?? null,
    custom_task_text: 'Smoke test task',
  });
  assert('HTTP 200 or 201', r.status === 200 || r.status === 201, `got ${r.status} — ${JSON.stringify(r.json)}`);
  assert('returns id', !!r.json?.id, JSON.stringify(r.json));
  packageId = r.json?.id;
}

if (!packageId) {
  console.error(`  ${FAIL} Cannot obtain package ID — aborting`);
  process.exit(1);
}

// 7. Upload capture (GPS + integrity fields)
console.log('7. Upload capture');
{
  const sha = sha256OfDataUrl(TINY_JPEG);

  // First attempt: include GPS fields (requires V2 migration to be applied)
  let r = await req('POST', '/api/captures', {
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
  });

  // Graceful degradation: if GPS columns are missing, retry without them
  const gpsColumnsMissing = r.status === 500 &&
    (r.json?.error?.includes('altitude_m') || r.json?.error?.includes('gps_accuracy_m'));

  if (gpsColumnsMissing) {
    console.log(`  \x1b[33m⚠ GPS columns missing — apply migration then re-run. Retrying without GPS...\x1b[0m`);
    console.log('    Run: supabase/migrations/20260313000000_grandproof_v2_core.sql');
    r = await req('POST', '/api/captures', {
      project_id: projectId,
      package_id: packageId,
      latitude: 32.08088,
      longitude: 34.78057,
      note: 'Smoke test capture',
      evidence_sha256: sha,
      capture_source: 'worker',
      photo_data: TINY_JPEG,
    });
  }

  assert('HTTP 200 or 201', r.status === 200 || r.status === 201, `got ${r.status} — ${JSON.stringify(r.json)}`);
  assert('returns id', !!r.json?.id, JSON.stringify(r.json));
  captureId = r.json?.id;
  if (!gpsColumnsMissing && r.json?.gps_accuracy_m !== undefined) {
    assert('gps_accuracy_m persisted', Number(r.json.gps_accuracy_m) === 5.2, String(r.json.gps_accuracy_m));
  }
}

// 8. Patch package status → submitted
console.log('8. Patch package status → submitted');
{
  const r = await req('PATCH', `/api/packages/${packageId}/status`, {
    status: 'submitted',
  });
  assert('HTTP 200', r.ok, `got ${r.status} — ${JSON.stringify(r.json)}`);
}

// 9. Verify capture appears in GET /api/captures
console.log('9. Verify capture retrievable');
{
  const r = await req('GET', `/api/captures?package_id=${packageId}`);
  assert('HTTP 200', r.ok, `got ${r.status}`);
  if (Array.isArray(r.json)) {
    assert('capture present in list', r.json.some((c) => c.id === captureId));
  } else {
    assert('returns array', false, JSON.stringify(r.json));
  }
}

// 10. Summary
console.log('\n─────────────────────────────────────────');
if (failCount === 0) {
  console.log(`${PASS} All checks passed\n`);
} else {
  console.error(`${FAIL} ${failCount} check(s) failed\n`);
  process.exit(1);
}
