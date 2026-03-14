/**
 * GrandProof V2 — SyncStatusChip
 * Inline chip for per-item sync state display.
 */

import { CheckCircle, Clock, UploadCloud, AlertCircle } from 'lucide-react';

type SyncState = 'draft' | 'queued' | 'syncing' | 'uploaded' | 'confirmed' | 'dead_letter' | 'failed';

interface Props {
  state: SyncState | string;
}

const CHIP: Record<string, { label: string; className: string; Icon: React.FC<{ className?: string }> }> = {
  draft:       { label: 'Draft',       className: 'bg-gray-500/20 text-gray-400',           Icon: Clock },
  queued:      { label: 'Pending',     className: 'bg-yellow-500/20 text-yellow-400',        Icon: Clock },
  syncing:     { label: 'Syncing…',    className: 'bg-brand-accent/20 text-brand-accent',    Icon: UploadCloud },
  uploaded:    { label: 'Uploaded',    className: 'bg-brand-accent/20 text-brand-accent',    Icon: CheckCircle },
  confirmed:   { label: 'Confirmed',   className: 'bg-brand-accent/20 text-brand-accent',    Icon: CheckCircle },
  failed:      { label: 'Failed',      className: 'bg-red-500/20 text-red-400',              Icon: AlertCircle },
  dead_letter: { label: 'Error',       className: 'bg-red-500/20 text-red-400',              Icon: AlertCircle },
};

export default function SyncStatusChip({ state }: Props) {
  const cfg = CHIP[state] ?? CHIP.draft;
  const { label, className, Icon } = cfg;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${className}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
