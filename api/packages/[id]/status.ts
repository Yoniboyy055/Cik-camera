import { methodNotAllowed, readBody, serverError } from '../../_lib/http.js';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';

interface StatusBody {
  status?: string;
  rejection_reason_code?: string;
  rejection_reason_text?: string;
  actor_id?: string;
  actor_name?: string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH') {
    return methodNotAllowed(res, ['PATCH']);
  }

  const idParam = req.query?.id;
  const packageId = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!packageId) {
    return res.status(400).json({ error: 'Package id is required' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = readBody<StatusBody>(req);
    const status = body.status;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    // Fetch previous status for the audit log
    const { data: prevRow } = await supabase
      .from('capture_packages')
      .select('status')
      .eq('id', packageId)
      .single();

    const packageUpdate: Record<string, unknown> = { status };
    if (status === 'rejected') {
      packageUpdate.rejection_reason_code = body.rejection_reason_code ?? null;
      packageUpdate.rejection_reason_text = body.rejection_reason_text ?? null;
    }

    const { error: packageError } = await supabase
      .from('capture_packages')
      .update(packageUpdate)
      .eq('id', packageId);

    if (packageError) {
      return serverError(res, packageError);
    }

    const { error: capturesError } = await supabase
      .from('captures')
      .update({ status })
      .eq('package_id', packageId);

    if (capturesError) {
      return serverError(res, capturesError);
    }

    // Write audit log row (best-effort — non-fatal if table not yet migrated)
    await supabase.from('capture_audit_log').insert({
      package_id: packageId,
      actor_id: body.actor_id ?? 'server',
      actor_name: body.actor_name ?? 'server',
      from_status: prevRow?.status ?? null,
      to_status: status,
      reason_code: body.rejection_reason_code ?? null,
      reason_text: body.rejection_reason_text ?? null,
    }).then(() => null, () => null); // swallow if table missing

    return res.status(200).json({ success: true });
  } catch (error) {
    return serverError(res, error);
  }
}
