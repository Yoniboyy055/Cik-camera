import { requireSession } from '../../_lib/auth.js';
import { badRequest, methodNotAllowed, readBody, serverError } from '../../_lib/http.js';
import { enforceRateLimit } from '../../_lib/rateLimit.js';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { asObject, optionalEnum, ValidationError } from '../../_lib/validation.js';
import { resolveWorkspaceContext } from '../../_lib/workspace.js';

interface StatusBody {
  status?: string;
}

const ALLOWED_STATUSES = ['submitted', 'approved', 'rejected'] as const;

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH') {
    return methodNotAllowed(res, ['PATCH']);
  }

  if (!enforceRateLimit(req, res, 'capture-status:update', 60, 60 * 1000)) {
    return;
  }

  const session = requireSession(req, res, ['supervisor', 'admin', 'owner']);
  if (!session) {
    return;
  }

  const idParam = req.query?.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!id) {
    return badRequest(res, 'Capture id is required');
  }

  try {
    const supabase = getSupabaseAdmin();
    const workspace = await resolveWorkspaceContext(supabase, session);
    const body = asObject(readBody<StatusBody>(req));
    const status = optionalEnum(body.status, 'status', ALLOWED_STATUSES);

    if (!status) {
      return badRequest(res, 'status is required');
    }

    const { data: updatedCaptureRows, error: captureError } = await supabase
      .from('captures')
      .update({ status })
      .eq('id', id)
      .eq('workspace_id', workspace.workspaceId)
      .select('id');

    if (captureError) {
      return serverError(res, captureError);
    }

    if ((updatedCaptureRows || []).length > 0) {
      return res.status(200).json({ success: true });
    }

    const { error: packageError } = await supabase
      .from('capture_packages')
      .update({ status })
      .eq('id', id)
      .eq('workspace_id', workspace.workspaceId);

    if (packageError) {
      return serverError(res, packageError);
    }

    const { error: packageCapturesError } = await supabase
      .from('captures')
      .update({ status })
      .eq('package_id', id)
      .eq('workspace_id', workspace.workspaceId);

    if (packageCapturesError) {
      return serverError(res, packageCapturesError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}
