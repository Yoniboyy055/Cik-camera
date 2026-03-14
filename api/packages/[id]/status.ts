import { requireSession } from '../../_lib/auth.js';
import { badRequest, forbidden, methodNotAllowed, readBody, serverError } from '../../_lib/http.js';
import { enforceRateLimit } from '../../_lib/rateLimit.js';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';
import { asObject, optionalEnum, optionalString, ValidationError } from '../../_lib/validation.js';
import { resolveWorkspaceContext } from '../../_lib/workspace.js';

interface StatusBody {
  status?: string;
  rejection_reason_code?: string;
  rejection_reason_text?: string;
  actor_id?: string;
  actor_name?: string;
}

const ALLOWED_STATUSES = ['in_progress', 'submitted', 'approved', 'rejected'] as const;

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH') {
    return methodNotAllowed(res, ['PATCH']);
  }

  if (!enforceRateLimit(req, res, 'package-status:update', 60, 60 * 1000)) {
    return;
  }

  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const idParam = req.query?.id;
  const packageId = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!packageId) {
    return badRequest(res, 'Package id is required');
  }

  try {
    const supabase = getSupabaseAdmin();
    const workspace = await resolveWorkspaceContext(supabase, session);
    const body = asObject(readBody<StatusBody>(req));
    const status = optionalEnum(body.status, 'status', ALLOWED_STATUSES);

    if (!status) {
      return badRequest(res, 'status is required');
    }

    // Fetch previous status for the audit log
    const { data: prevRow } = await supabase
      .from('capture_packages')
      .select('status, user_id, workspace_id')
      .eq('id', packageId)
      .eq('workspace_id', workspace.workspaceId)
      .maybeSingle();

    if (!prevRow) {
      return badRequest(res, 'Package not found');
    }

    if (workspace.role !== 'supervisor' && workspace.role !== 'admin' && workspace.role !== 'owner' && prevRow.user_id !== session.id) {
      return forbidden(res, 'You do not have access to this package');
    }

    const workerAllowed = new Set(['in_progress', 'submitted']);
    const supervisorAllowed = new Set(['approved', 'rejected', 'submitted', 'in_progress']);
    const allowedForRole = workspace.role === 'supervisor' || workspace.role === 'admin' || workspace.role === 'owner'
      ? supervisorAllowed
      : workerAllowed;
    if (!allowedForRole.has(status)) {
      return forbidden(res, `Role ${session.role} cannot set package status to ${status}`);
    }

    const packageUpdate: Record<string, unknown> = { status };
    if (status === 'rejected') {
      packageUpdate.rejection_reason_code = optionalString(body.rejection_reason_code, 'rejection_reason_code', { allowNull: true, max: 100 }) ?? null;
      packageUpdate.rejection_reason_text = optionalString(body.rejection_reason_text, 'rejection_reason_text', { allowNull: true, max: 1000 }) ?? null;
    }

    const { error: packageError } = await supabase
      .from('capture_packages')
      .update(packageUpdate)
      .eq('id', packageId)
      .eq('workspace_id', workspace.workspaceId);

    if (packageError) {
      return serverError(res, packageError);
    }

    const { error: capturesError } = await supabase
      .from('captures')
      .update({ status })
      .eq('package_id', packageId)
      .eq('workspace_id', workspace.workspaceId);

    if (capturesError) {
      return serverError(res, capturesError);
    }

    // Write audit log row (best-effort — non-fatal if table not yet migrated)
    await supabase.from('capture_audit_log').insert({
      package_id: packageId,
      workspace_id: workspace.workspaceId,
      actor_id: session.id,
      actor_name: session.name,
      from_status: prevRow?.status ?? null,
      to_status: status,
      reason_code: optionalString(body.rejection_reason_code, 'rejection_reason_code', { allowNull: true, max: 100 }) ?? null,
      reason_text: optionalString(body.rejection_reason_text, 'rejection_reason_text', { allowNull: true, max: 1000 }) ?? null,
    }).then(() => null, () => null); // swallow if table missing

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}
