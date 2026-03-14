/**
 * GrandProof V2 — useSyncQueue hook
 * Exposes the raw outbox ops for the OfflineQueue page + retry/clear actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { offlineDB, type OutboxOp } from '../db';
import { drainOutbox } from '../syncManager';

export function useSyncQueue() {
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const all = await offlineDB.getAllOps();
    // Sort: queued first, then failed, then succeeded
    all.sort((a, b) => {
      const order = { queued: 0, in_flight: 1, failed: 2, succeeded: 3 };
      return (order[a.state] ?? 9) - (order[b.state] ?? 9);
    });
    setOps(all);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  const retryAll = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      // Reset failed ops back to queued so drainOutbox picks them up
      const failed = ops.filter((op) => op.state === 'failed');
      for (const op of failed) {
        await offlineDB.updateOp({ ...op, state: 'queued', next_retry_at: Date.now() });
      }
      await drainOutbox();
      await load();
    } finally {
      setSyncing(false);
    }
  }, [ops, syncing, load]);

  const clearSucceeded = useCallback(async () => {
    const succeeded = ops.filter((op) => op.state === 'succeeded');
    for (const op of succeeded) {
      await offlineDB.deleteOp(op.op_id);
    }
    await load();
  }, [ops, load]);

  const discardFailed = useCallback(async (opId: string) => {
    await offlineDB.deleteOp(opId);
    await load();
  }, [load]);

  return { ops, syncing, retryAll, clearSucceeded, discardFailed, refresh: load };
}
