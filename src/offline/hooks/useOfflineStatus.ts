/**
 * GrandProof V2 — useOfflineStatus hook
 * Returns live network + sync queue stats for UI indicators.
 */

import { useState, useEffect } from 'react';
import { subscribeNetworkStatus, type NetworkStatus } from '../network';
import { offlineDB, type OutboxOp } from '../db';
import { drainOutbox } from '../syncManager';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'failed';

export interface OfflineStatusResult {
  networkStatus: NetworkStatus;
  syncStatus: SyncStatus;
  queuedCount: number;
  failedCount: number;
  lastSyncedAt: number | null;
}

export function useOfflineStatus(): OfflineStatusResult {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(
    navigator.onLine ? 'online' : 'offline'
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [queuedCount, setQueuedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // Refresh queue counts from IDB
  const refreshCounts = async () => {
    const ops = await offlineDB.getAllOps();
    setQueuedCount(ops.filter((op: OutboxOp) => op.state === 'queued').length);
    setFailedCount(ops.filter((op: OutboxOp) => op.state === 'failed').length);
  };

  // Trigger a drain and update sync status
  const runSync = async () => {
    if (syncStatus === 'syncing') return;
    setSyncStatus('syncing');
    try {
      await drainOutbox();
      await refreshCounts();
      setLastSyncedAt(Date.now());
      setSyncStatus('synced');
    } catch {
      setSyncStatus('failed');
    }
  };

  useEffect(() => {
    // Subscribe to network changes
    const unsubscribe = subscribeNetworkStatus(async (status) => {
      setNetworkStatus(status);
      if (status === 'online') {
        await runSync();
      }
    });

    // Initial count
    refreshCounts();

    // Poll counts every 15s in case IDB changes externally
    const pollInterval = setInterval(refreshCounts, 15_000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { networkStatus, syncStatus, queuedCount, failedCount, lastSyncedAt };
}
