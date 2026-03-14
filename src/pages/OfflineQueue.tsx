/**
 * GrandProof V2 — Offline Queue page
 * Shows all pending / failed sync operations and lets workers retry or discard.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, UploadCloud, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useSyncQueue } from '../offline/hooks/useSyncQueue';
import { useOfflineStatus } from '../offline/hooks/useOfflineStatus';
import type { OutboxOp } from '../offline/db';

const OP_LABELS: Record<string, string> = {
  create_package: 'Create Package',
  create_capture: 'Upload Capture',
  update_status:  'Update Status',
};

function StateIcon({ state }: { state: OutboxOp['state'] }) {
  if (state === 'succeeded') return <CheckCircle className="w-4 h-4 text-brand-accent" />;
  if (state === 'failed')    return <AlertCircle className="w-4 h-4 text-red-400" />;
  if (state === 'in_flight') return <RefreshCw className="w-4 h-4 text-brand-accent animate-spin" />;
  return <Clock className="w-4 h-4 text-yellow-400" />;
}

export default function OfflineQueue() {
  const navigate = useNavigate();
  const { ops, syncing, retryAll, clearSucceeded, discardFailed, refresh } = useSyncQueue();
  const { networkStatus } = useOfflineStatus();

  const queued  = ops.filter((op) => op.state === 'queued');
  const failed  = ops.filter((op) => op.state === 'failed');
  const inflight = ops.filter((op) => op.state === 'in_flight');
  const done    = ops.filter((op) => op.state === 'succeeded');

  const isEmpty = ops.length === 0;

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      {/* Header */}
      <header className="bg-brand-surface border-b border-brand-border px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 text-brand-text-muted hover:text-brand-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Offline Queue</h1>
          <p className="text-xs text-brand-text-muted capitalize">{networkStatus}</p>
        </div>
        <button
          onClick={() => refresh()}
          className="p-2 text-brand-text-muted hover:text-brand-text"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </header>

      <main className="p-6 max-w-2xl mx-auto space-y-6">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pending',  count: queued.length + inflight.length, color: 'text-yellow-400' },
            { label: 'Failed',   count: failed.length,  color: 'text-red-400' },
            { label: 'Synced',   count: done.length,    color: 'text-brand-accent' },
          ].map(({ label, count, color }) => (
            <div key={label} className="bg-brand-surface border border-brand-border rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
              <p className="text-xs text-brand-text-muted mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={retryAll}
            disabled={syncing || networkStatus === 'offline' || (queued.length + failed.length) === 0}
            className="flex-1 flex items-center justify-center gap-2 bg-brand-accent text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-accent/90 transition-colors"
          >
            <UploadCloud className={`w-4 h-4 ${syncing ? 'animate-bounce' : ''}`} />
            {syncing ? 'Syncing…' : 'Retry All'}
          </button>
          {done.length > 0 && (
            <button
              onClick={clearSucceeded}
              className="flex items-center gap-2 bg-brand-surface border border-brand-border text-brand-text-muted py-2.5 px-4 rounded-xl text-sm hover:text-brand-text transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Clear Done
            </button>
          )}
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div className="bg-brand-surface border border-brand-border rounded-xl p-10 text-center">
            <CheckCircle className="w-8 h-8 text-brand-accent mx-auto mb-3" />
            <p className="font-semibold">All synced</p>
            <p className="text-sm text-brand-text-muted mt-1">No pending operations.</p>
          </div>
        )}

        {/* Op list */}
        {ops.length > 0 && (
          <div className="space-y-3">
            {ops.map((op) => (
              <div
                key={op.op_id}
                className="bg-brand-surface border border-brand-border rounded-xl p-4 flex items-start gap-3"
              >
                <div className="mt-0.5">
                  <StateIcon state={op.state} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{OP_LABELS[op.op_type] ?? op.op_type}</p>
                  <p className="text-xs text-brand-text-muted truncate">ID: {op.payload_ref}</p>
                  <p className="text-xs text-brand-text-muted">
                    Attempt {op.attempt_count} · {
                      op.state === 'queued' && op.next_retry_at > Date.now()
                        ? `Retry at ${format(new Date(op.next_retry_at), 'HH:mm:ss')}`
                        : op.state === 'succeeded'
                          ? 'Done'
                          : 'Ready'
                    }
                  </p>
                  {op.last_error && (
                    <p className="text-xs text-red-400 mt-1 truncate">{op.last_error}</p>
                  )}
                </div>
                {op.state === 'failed' && (
                  <button
                    onClick={() => discardFailed(op.op_id)}
                    className="p-1.5 text-brand-text-muted hover:text-red-400 transition-colors"
                    title="Discard"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
