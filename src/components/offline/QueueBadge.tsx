/**
 * GrandProof V2 — QueueBadge
 * Small badge showing pending sync count. Tap to navigate to /offline-queue.
 * Renders nothing when queue is empty and online.
 */

import { useNavigate } from 'react-router-dom';
import { UploadCloud } from 'lucide-react';
import { useOfflineStatus } from '../../offline/hooks/useOfflineStatus';

export default function QueueBadge() {
  const navigate = useNavigate();
  const { queuedCount, failedCount, networkStatus } = useOfflineStatus();

  const total = queuedCount + failedCount;
  if (total === 0 && networkStatus === 'online') return null;

  const hasFailures = failedCount > 0;

  return (
    <button
      onClick={() => navigate('/offline-queue')}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        hasFailures
          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
          : 'bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30'
      }`}
      title="View offline sync queue"
    >
      <UploadCloud className="w-3.5 h-3.5" />
      {total > 0 ? `${total} pending` : 'Offline'}
    </button>
  );
}
