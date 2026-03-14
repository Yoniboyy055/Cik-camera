/**
 * GrandProof V2 — Report Bundle
 * Generates a downloadable Evidence ZIP with a manifest, per-capture metadata,
 * the original images, and verification instructions.
 */

import JSZip from 'jszip';

const EVIDENCE_CACHE = 'gp-images-v1';

export interface BundleCapture {
  id: string;
  requirement_label: string | null;
  project_name: string | null;
  template_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  measurement: string | null;
  unit: string | null;
  evidence_sha256: string | null;
  photo_url: string;
  created_at: string;
}

export interface BundlePackage {
  id: string;
  project_name: string | null;
  template_name: string | null;
  user_name: string | null;
  status: string;
  created_at: string;
  captures: BundleCapture[];
}

async function fetchImageBlob(url: string): Promise<Blob | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.blob();
  } catch {
    return null;
  }
}

export async function downloadEvidenceBundle(pkg: BundlePackage): Promise<void> {
  const zip = new JSZip();

  const manifest: Record<string, unknown> = {
    grandproof_version: '2.0',
    product_name: 'GrandProof',
    descriptor: 'Verified Field Evidence Platform',
    tagline: 'Capture. Verify. Prove.',
    generated_at: new Date().toISOString(),
    package_id: pkg.id,
    project: pkg.project_name,
    template: pkg.template_name,
    worker: pkg.user_name,
    status: pkg.status,
    created_at: pkg.created_at,
    captures: pkg.captures.map((c) => ({
      id: c.id,
      requirement: c.requirement_label,
      address: c.address,
      coordinates: c.latitude != null ? { lat: c.latitude, lng: c.longitude } : null,
      note: c.note,
      measurement: c.measurement ? `${c.measurement} ${c.unit}` : null,
      evidence_sha256: c.evidence_sha256,
      photo_url: c.photo_url,
      captured_at: c.created_at,
    })),
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file(
    'verify_instructions.txt',
    'For each file in captures/, compute the SHA-256 hash of the image bytes.\n' +
      'Compare the result to the evidence_sha256 field in the matching metadata file.\n' +
      'Any mismatch indicates the image has been modified after capture.',
  );

  const capturesFolder = zip.folder('captures');
  if (!capturesFolder) {
    throw new Error('Failed to create ZIP bundle');
  }

  await Promise.all(
    pkg.captures.map(async (capture) => {
      capturesFolder.file(
        `${capture.id}.json`,
        JSON.stringify(
          {
            id: capture.id,
            requirement_label: capture.requirement_label,
            project_name: capture.project_name,
            template_name: capture.template_name,
            address: capture.address,
            latitude: capture.latitude,
            longitude: capture.longitude,
            note: capture.note,
            measurement: capture.measurement,
            unit: capture.unit,
            evidence_sha256: capture.evidence_sha256,
            photo_url: capture.photo_url,
            created_at: capture.created_at,
          },
          null,
          2,
        ),
      );

      if (!capture.photo_url) {
        return;
      }

      const blob = await fetchImageBlob(capture.photo_url);
      if (blob) {
        capturesFolder.file(`${capture.id}.jpg`, blob);
      }
    }),
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `grandproof-evidence-${pkg.id.slice(0, 8)}-${date}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Cache evidence images in CacheStorage for offline access.
 * Prefetches all photo_urls for the packages provided.
 */
export async function makeEvidenceAvailableOffline(packages: BundlePackage[]): Promise<number> {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(EVIDENCE_CACHE);
  let count = 0;
  for (const pkg of packages) {
    for (const cap of pkg.captures) {
      if (!cap.photo_url) continue;
      try {
        const existing = await cache.match(cap.photo_url);
        if (!existing) {
          await cache.add(cap.photo_url);
          count++;
        }
      } catch {
        // Silently skip images that fail to cache (CORS, etc.)
      }
    }
  }
  return count;
}

/** Pre-fetch evidence images for a set of packages (supervisor "Make Available Offline") */
export async function prefetchEvidenceImages(
  packages: BundlePackage[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const urls = packages.flatMap((p) =>
    p.captures.map((c) => c.photo_url).filter(Boolean),
  );
  const total = urls.length;
  let done = 0;
  const cache = 'caches' in window ? await caches.open(EVIDENCE_CACHE) : null;
  for (const url of urls) {
    try {
      if (cache && !(await cache.match(url))) {
        await cache.add(url);
      }
    } catch {
      // ignore cache failures and continue
    }
    done++;
    onProgress?.(done, total);
  }
}
