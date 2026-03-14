import { randomUUID } from 'node:crypto';
import { requireSession } from '../_lib/auth.js';
import { badRequest, forbidden, methodNotAllowed, readBody, serverError } from '../_lib/http.js';
import { enforceRateLimit } from '../_lib/rateLimit.js';
import { getStorageBucket, getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { asObject, optionalString, ValidationError } from '../_lib/validation.js';
import { resolveWorkspaceContext } from '../_lib/workspace.js';

interface UploadUrlBody {
  package_id?: string | null;
  content_type?: string;
  file_extension?: string;
}

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function normalizeExtension(contentType: string, candidate?: string | null): string {
  if (candidate) {
    const ext = candidate.replace(/^\./, '').toLowerCase();
    if (/^[a-z0-9]{2,8}$/.test(ext)) return ext;
  }
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!enforceRateLimit(req, res, 'captures:upload-url', 120, 60 * 1000)) {
    return;
  }

  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = asObject(readBody<UploadUrlBody>(req));
    const packageId = optionalString(body.package_id, 'package_id', { allowNull: true }) ?? null;
    const contentType = optionalString(body.content_type, 'content_type', { allowNull: true, max: 100 }) || 'image/jpeg';

    if (!ALLOWED_CONTENT_TYPES.has(contentType.toLowerCase())) {
      return badRequest(res, 'Unsupported content_type');
    }

    const workspace = await resolveWorkspaceContext(supabase, session);

    if (packageId) {
      const { data: pkg } = await supabase
        .from('capture_packages')
        .select('id, user_id, workspace_id')
        .eq('id', packageId)
        .eq('workspace_id', workspace.workspaceId)
        .maybeSingle();

      if (!pkg) {
        return badRequest(res, 'Package not found in workspace');
      }

      if (workspace.role !== 'supervisor' && workspace.role !== 'admin' && workspace.role !== 'owner' && pkg.user_id !== session.id) {
        return forbidden(res, 'You do not have access to this package');
      }
    }

    const extension = normalizeExtension(contentType, optionalString(body.file_extension, 'file_extension', { allowNull: true, max: 8 }));
    const fileId = randomUUID();
    const folder = packageId || 'unpackaged';
    const objectPath = `${workspace.workspaceId}/${folder}/${fileId}.${extension}`;

    const { data, error } = await supabase.storage
      .from(getStorageBucket())
      .createSignedUploadUrl(objectPath);

    if (error || !data?.signedUrl) {
      return serverError(res, error || new Error('Failed to create signed upload URL'));
    }

    const { data: publicUrlData } = supabase.storage.from(getStorageBucket()).getPublicUrl(objectPath);

    return res.status(200).json({
      storage_path: data.path || objectPath,
      signed_upload_url: data.signedUrl,
      token: data.token,
      public_url: publicUrlData.publicUrl,
      bucket: getStorageBucket(),
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}
