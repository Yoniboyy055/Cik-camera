/**
 * GrandProof V2 — Offline Engine
 * IndexedDB schema + helper functions using the native IDBOpenDBRequest API.
 * Database: gp_offline_v2 / version 2
 *
 * Object stores:
 *   packages  – offline capture packages
 *   captures  – individual capture rows (without blob)
 *   blobs     – binary photo data keyed by a blob_id uuid
 *   outbox    – pending sync operations (idempotency queue)
 *   sync_events – append-only debug log
 */

const DB_NAME = 'gp_offline_v2';
const DB_VERSION = 2;

let _db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('packages')) {
        const pkgStore = db.createObjectStore('packages', { keyPath: 'package_id' });
        pkgStore.createIndex('user_id', 'user_id');
        pkgStore.createIndex('status', 'status');
        pkgStore.createIndex('created_at', 'created_at');
        pkgStore.createIndex('sync_state', 'sync_state');
      }

      if (!db.objectStoreNames.contains('captures')) {
        const capStore = db.createObjectStore('captures', { keyPath: 'capture_id' });
        capStore.createIndex('package_id', 'package_id');
        capStore.createIndex('user_id', 'user_id');
        capStore.createIndex('sync_state', 'sync_state');
        capStore.createIndex('captured_at', 'captured_at');
      }

      if (!db.objectStoreNames.contains('blobs')) {
        const blobStore = db.createObjectStore('blobs', { keyPath: 'blob_id' });
        blobStore.createIndex('package_id', 'package_id');
        blobStore.createIndex('capture_id', 'capture_id');
      }

      if (!db.objectStoreNames.contains('outbox')) {
        const outboxStore = db.createObjectStore('outbox', { keyPath: 'op_id' });
        outboxStore.createIndex('state', 'state');
        outboxStore.createIndex('next_retry_at', 'next_retry_at');
      }

      if (!db.objectStoreNames.contains('sync_events')) {
        db.createObjectStore('sync_events', { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

function idbPut<T>(storeName: string, value: T): Promise<void> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

function idbGetAll<T>(storeName: string): Promise<T[]> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  }));
}

function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbGetByIndex<T>(storeName: string, indexName: string, value: IDBValidKey): Promise<T[]> {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  }));
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface OfflinePackage {
  package_id: string;
  user_id: string;
  project_id: string | null;
  custom_project_name: string | null;
  task_template_id: string | null;
  custom_task_text: string | null;
  status: string;
  sync_state: 'draft' | 'queued' | 'syncing' | 'uploaded' | 'confirmed' | 'dead_letter';
  created_at: string;
  remote_package_id?: string | null; // server-assigned ID stored after successful sync
}

export interface OfflineCapture {
  capture_id: string;
  package_id: string;
  blob_id: string; // foreign key into blobs store
  user_id: string;
  project_id: string | null;
  requirement_id: string | null;
  note: string | null;
  measurement: string | null;
  unit: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy_m: number | null;
  altitude_m: number | null;
  address: string | null;
  evidence_sha256: string | null;
  sync_state: string;
  captured_at: string;
}

export interface OfflineBlob {
  blob_id: string;
  package_id: string;
  capture_id: string;
  blob: Blob;
  mime: string;
  bytes: number;
}

export interface OutboxOp {
  op_id: string; // idempotency key (uuid)
  op_type: 'create_package' | 'create_capture' | 'update_status';
  payload_ref: string; // package_id or capture_id in respective store
  attempt_count: number;
  next_retry_at: number; // epoch ms
  state: 'queued' | 'in_flight' | 'succeeded' | 'failed';
  last_error: string | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const offlineDB = {
  // packages
  savePackage: (pkg: OfflinePackage) => idbPut('packages', pkg),
  getPackage: (id: string) => idbGet<OfflinePackage>('packages', id),
  getAllPackages: () => idbGetAll<OfflinePackage>('packages'),

  // captures
  saveCapture: (cap: OfflineCapture) => idbPut('captures', cap),
  getCapture: (id: string) => idbGet<OfflineCapture>('captures', id),
  getCapturesByPackage: (packageId: string) =>
    idbGetByIndex<OfflineCapture>('captures', 'package_id', packageId),

  // blobs
  saveBlob: (blob: OfflineBlob) => idbPut('blobs', blob),
  getBlob: (id: string) => idbGet<OfflineBlob>('blobs', id),
  getBlobsByPackage: (packageId: string) =>
    idbGetByIndex<OfflineBlob>('blobs', 'package_id', packageId),
  deleteBlob: (id: string) => idbDelete('blobs', id),

  // outbox
  enqueue: (op: OutboxOp) => idbPut('outbox', op),
  getQueuedOps: () => idbGetByIndex<OutboxOp>('outbox', 'state', 'queued'),
  updateOp: (op: OutboxOp) => idbPut('outbox', op),
  deleteOp: (id: string) => idbDelete('outbox', id),
  getAllOps: () => idbGetAll<OutboxOp>('outbox'),

  // sync_events
  logEvent: (level: 'info' | 'warn' | 'error', msg: string, context?: unknown) =>
    idbPut('sync_events', { ts: Date.now(), level, msg, context }),
};
