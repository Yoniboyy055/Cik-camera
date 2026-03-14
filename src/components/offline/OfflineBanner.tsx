/**
 * GrandProof V2 — OfflineBanner
 * Sticky top banner that shows current connectivity state.
 * Only renders when NOT fully online+idle.
 */

import { AnimatePresence, motion } from 'motion/react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useOfflineStatus } from '../../offline/hooks/useOfflineStatus';

export default function OfflineBanner() {
  const { networkStatus, syncStatus, queuedCount } = useOfflineStatus();

  const isVisible = networkStatus !== 'online' || syncStatus === 'syncing';

  let bg = 'bg-yellow-600';
  let Icon = RefreshCw;
  let label = 'Reconnecting…';

  if (networkStatus === 'offline') {
    bg = 'bg-red-600';
    Icon = WifiOff;
    label = 'You are offline — captures will be saved locally';
  } else if (networkStatus === 'reconnecting') {
    bg = 'bg-yellow-600';
    Icon = RefreshCw;
    label = 'Reconnecting…';
  } else if (syncStatus === 'syncing') {
    bg = 'bg-brand-accent/90';
    Icon = RefreshCw;
    label = queuedCount > 0 ? `Syncing ${queuedCount} pending capture${queuedCount === 1 ? '' : 's'}…` : 'Syncing…';
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="offline-banner"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`${bg} text-white text-sm font-medium flex items-center justify-center gap-2 px-4 py-2 z-50`}
        >
          <Icon className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
          {label}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
