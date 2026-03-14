/**
 * GrandProof V2 — Evidence Integrity
 * Computes SHA-256 hashes using Web Crypto (crypto.subtle.digest).
 * The combined evidence fingerprint = SHA256(imageHash + "." + metaHash).
 */

/** Convert an ArrayBuffer to a lowercase hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256 of a BufferSource. Returns hex string. */
export async function sha256Hex(data: BufferSource): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(buf);
}

/** SHA-256 of a UTF-8 string. Returns hex string. */
export async function sha256String(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  return sha256Hex(encoded);
}

/** SHA-256 of a Blob. Returns hex string. */
export async function sha256Blob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return sha256Hex(new Uint8Array(buf));
}

/**
 * Compute the combined evidence fingerprint for a capture:
 *   evidenceHash = SHA256(imageHash + "." + metadataHash)
 *
 * @param imageBlob    The baked overlay image as a Blob.
 * @param metadata     Canonical metadata object (will be JSON.stringify'd with sorted keys).
 * @returns            { imageHash, metadataHash, evidenceHash }
 */
export async function computeEvidenceHash(
  imageBlob: Blob,
  metadata: Record<string, unknown>,
): Promise<{ imageHash: string; metadataHash: string; evidenceHash: string }> {
  const imageHash = await sha256Blob(imageBlob);
  const metaJson = JSON.stringify(
    Object.keys(metadata)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => { acc[k] = metadata[k]; return acc; }, {}),
  );
  const metadataHash = await sha256String(metaJson);
  const combined = `${imageHash}.${metadataHash}`;
  const evidenceHash = await sha256String(combined);
  return { imageHash, metadataHash, evidenceHash };
}

/**
 * Convert a base64 data URL to a Blob for hashing.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
