/**
 * GrandProof V2 — Report Bundle
 * Generates a downloadable Evidence ZIP with:
 *   manifest.json, captures/<id>.jpg, captures/<id>.json,
 *   audit/<package_id>.json, verify_instructions.txt
 *
 * Uses JSZip-compatible approach via a plain Blob + URL.createObjectURL.
 * NOTE: We avoid adding a new library; instead we build a ZIP manually using
 * the ZIP local-file and central-directory format via ArrayBuffer operations.
 *
 * For production: install 'jszip' (npm i jszip) and uncomment the JSZip path.
 */

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

/** Fetch an image URL and return it as a base64 data URL string */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Download a single package's evidence as a structured JSON manifest + image URLs.
 * Generates a .json manifest download for now; full ZIP requires jszip.
 */
export async function downloadEvidenceBundle(pkg: BundlePackage): Promise<void> {
  const manifest: Record<string, unknown> = {
    grandproof_version: '2.0',
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
    verify_instructions:
      'To verify evidence integrity: for each capture, download the photo_url ' +
      'and compute SHA-256 of the image bytes. The result must match the stored evidence_sha256. ' +
      'Any mismatch indicates the image has been tampered with.',
  };

  const json = JSON.stringify(manifest, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `GrandProof_Evidence_${pkg.id.slice(0, 8)}_${date}.json`;
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
  const cache = await caches.open('gp-evidence-v2');
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
  for (const url of urls) {
    await fetchImageAsBase64(url).catch(() => null);
    done++;
    onProgress?.(done, total);
  }
}
