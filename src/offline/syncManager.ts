/**
 * GrandProof V2 — Sync Manager
 * Drains the outbox queue when online.
 * Features: idempotency keys, exponential back-off, retry limit, dead-letter.
 */

import { offlineDB, OutboxOp } from './db';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 3000;

// ─── UUID helper (falls back for envs without crypto.randomUUID) ──────────────

export function randomUUID(): string {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ─── Enqueue helpers ─────────────────────────────────────────────────────────

export async function enqueueCreatePackage(packageId: string): Promise<void> {
  const op: OutboxOp = {
    op_id: randomUUID(),
    op_type: 'create_package',
    payload_ref: packageId,
    attempt_count: 0,
    next_retry_at: Date.now(),
    state: 'queued',
    last_error: null,
  };
  await offlineDB.enqueue(op);
  await offlineDB.logEvent('info', 'enqueue create_package', { packageId });
}

export async function enqueueCreateCapture(captureId: string): Promise<void> {
  const op: OutboxOp = {
    op_id: randomUUID(),
    op_type: 'create_capture',
    payload_ref: captureId,
    attempt_count: 0,
    next_retry_at: Date.now(),
    state: 'queued',
    last_error: null,
  };
  await offlineDB.enqueue(op);
  await offlineDB.logEvent('info', 'enqueue create_capture', { captureId });
}

// ─── Upload a single offline capture to server ───────────────────────────────

async function uploadCapture(captureId: string): Promise<void> {
  const capture = await offlineDB.getCapture(captureId);
  if (!capture) throw new Error(`Capture ${captureId} not found in IDB`);

  const blob = await offlineDB.getBlob(capture.blob_id);
  if (!blob) throw new Error(`Blob ${capture.blob_id} not found in IDB`);

  // Convert Blob back to base64 data URL
  const photoData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob.blob);
  });

  // Resolve the effective package ID: use the server-assigned remote ID so
  // the capture lands in the correct package instead of being nulled out by
  // the api/captures.ts local-* guard.
  let resolvedPackageId: string | null = capture.package_id ?? null;
  if (capture.package_id) {
    const pkg = await offlineDB.getPackage(capture.package_id);
    if (pkg?.remote_package_id) {
      resolvedPackageId = pkg.remote_package_id;
    } else if (capture.package_id.startsWith('local-') || capture.package_id.startsWith('gp-offline-')) {
      throw new Error(`Package ${capture.package_id} not yet synced — deferring capture`);
    }
  }

  const resp = await fetch('/api/captures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: capture.user_id,
      project_id: capture.project_id,
      package_id: resolvedPackageId,
      requirement_id: capture.requirement_id,
      note: capture.note,
      measurement: capture.measurement,
      unit: capture.unit,
      latitude: capture.latitude,
      longitude: capture.longitude,
      gps_accuracy_m: capture.gps_accuracy_m ?? null,
      altitude_m: capture.altitude_m ?? null,
      address: capture.address,
      evidence_sha256: capture.evidence_sha256,
      capture_source: 'worker',
      photo_data: photoData,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${body}`);
  }
}

// ─── Upload a single offline package to server ───────────────────────────────

async function uploadPackage(packageId: string): Promise<void> {
  const pkg = await offlineDB.getPackage(packageId);
  if (!pkg) throw new Error(`Package ${packageId} not found in IDB`);

  const resp = await fetch('/api/capture-packages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: pkg.user_id,
      project_id: pkg.project_id,
      custom_project_name: pkg.custom_project_name,
      task_template_id: pkg.task_template_id,
      custom_task_text: pkg.custom_task_text,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${body}`);
  }

  // Store the server-assigned ID so uploadCapture() can use it for grouping.
  const data = await resp.json();
  const remoteId: string | undefined = data?.id;
  if (remoteId) {
    await offlineDB.savePackage({ ...pkg, remote_package_id: remoteId });
    await offlineDB.logEvent('info', 'package synced, remote ID stored', { packageId, remoteId });
  }
}

// ─── Process one outbox operation ────────────────────────────────────────────

async function processOp(op: OutboxOp): Promise<void> {
  const updated: OutboxOp = { ...op, state: 'in_flight', attempt_count: op.attempt_count + 1 };
  await offlineDB.updateOp(updated);

  try {
    if (op.op_type === 'create_package') {
      await uploadPackage(op.payload_ref);
    } else if (op.op_type === 'create_capture') {
      await uploadCapture(op.payload_ref);
      // Clean up blob after successful upload
      const capture = await offlineDB.getCapture(op.payload_ref);
      if (capture?.blob_id) await offlineDB.deleteBlob(capture.blob_id);
    }

    await offlineDB.deleteOp(op.op_id);
    await offlineDB.logEvent('info', `sync succeeded: ${op.op_type}`, { opId: op.op_id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await offlineDB.logEvent('warn', `sync failed: ${op.op_type}`, { opId: op.op_id, err: msg });

    const isFatal = updated.attempt_count >= MAX_ATTEMPTS;
    const backoff = Math.min(BASE_DELAY_MS * 2 ** (updated.attempt_count - 1), 60_000);

    await offlineDB.updateOp({
      ...updated,
      state: isFatal ? 'failed' : 'queued',
      last_error: msg,
      next_retry_at: isFatal ? updated.next_retry_at : Date.now() + backoff,
    });
  }
}

// ─── Drain the whole outbox (sequential to avoid duplicate POSTs) ─────────────

let _syncing = false;

export async function drainOutbox(): Promise<void> {
  if (_syncing || !navigator.onLine) return;
  _syncing = true;
  try {
    const ops = await offlineDB.getQueuedOps();
    const ready = ops.filter((op) => op.next_retry_at <= Date.now());
    for (const op of ready) {
      if (!navigator.onLine) break;
      await processOp(op);
    }
  } finally {
    _syncing = false;
  }
}

// ─── Network event listeners ──────────────────────────────────────────────────

let _listening = false;

export function startSyncListener(): void {
  if (_listening) return;
  _listening = true;

  window.addEventListener('online', () => {
    offlineDB.logEvent('info', 'network online — starting sync drain');
    drainOutbox().catch(console.error);
  });

  // Periodic retry for queued ops that hit backoff timers (every 30s when online)
  setInterval(() => {
    if (navigator.onLine) drainOutbox().catch(console.error);
  }, 30_000);
}
