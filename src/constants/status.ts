/** GrandProof V2 — canonical status values (single source of truth) */

export const PACKAGE_STATUS = {
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type PackageStatus = typeof PACKAGE_STATUS[keyof typeof PACKAGE_STATUS];

export const CAPTURE_STATUS = {
  DRAFT: 'draft',
  UPLOADED: 'uploaded',
} as const;

export type CaptureStatus = typeof CAPTURE_STATUS[keyof typeof CAPTURE_STATUS];

/** Statuses that count as "pending review" in analytics */
export const PENDING_STATUSES: string[] = [
  CAPTURE_STATUS.UPLOADED,
  CAPTURE_STATUS.DRAFT,
  PACKAGE_STATUS.IN_PROGRESS,
  PACKAGE_STATUS.SUBMITTED,
];
