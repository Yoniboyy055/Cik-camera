export interface SignedUploadResult {
  storagePath: string;
  publicUrl: string;
}

interface SignedUploadUrlResponse {
  storage_path: string;
  signed_upload_url: string;
  public_url: string;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return await response.blob();
}

export async function uploadEvidenceBlob(blob: Blob, packageId?: string | null): Promise<SignedUploadResult> {
  const urlRes = await fetch('/api/captures/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      package_id: packageId || null,
      content_type: blob.type || 'image/jpeg',
    }),
  });

  if (!urlRes.ok) {
    throw new Error(`Failed to create signed upload URL: HTTP ${urlRes.status} ${await urlRes.text()}`);
  }

  const payload = (await urlRes.json()) as SignedUploadUrlResponse;
  if (!payload?.signed_upload_url || !payload?.storage_path) {
    throw new Error('Invalid signed upload URL response');
  }

  const uploadRes = await fetch(payload.signed_upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': blob.type || 'image/jpeg',
      'x-upsert': 'false',
    },
    body: blob,
  });

  if (!uploadRes.ok) {
    throw new Error(`Signed upload failed: HTTP ${uploadRes.status} ${await uploadRes.text()}`);
  }

  return {
    storagePath: payload.storage_path,
    publicUrl: payload.public_url,
  };
}
