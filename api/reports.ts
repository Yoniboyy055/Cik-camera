import { randomUUID } from 'node:crypto';
import { requireSession } from './_lib/auth.js';
import { badRequest, methodNotAllowed, readBody, serverError } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { asObject, ValidationError } from './_lib/validation.js';
import { resolveWorkspaceContext } from './_lib/workspace.js';

interface CreateReportBody {
  capture_ids: string[];
  package_id?: string | null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!enforceRateLimit(req, res, 'reports:create', 20, 60 * 1000)) {
    return;
  }

  const session = requireSession(req, res, ['supervisor', 'admin', 'owner']);
  if (!session) {
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const workspace = await resolveWorkspaceContext(supabase, session);
    const body = asObject(readBody<CreateReportBody>(req));

    const captureIds = body.capture_ids;
    if (!Array.isArray(captureIds) || captureIds.length === 0) {
      return badRequest(res, 'capture_ids must be a non-empty array');
    }
    if (captureIds.length > 500) {
      return badRequest(res, 'Too many capture_ids (max 500)');
    }
    for (const id of captureIds) {
      if (typeof id !== 'string' || id.length === 0 || id.length > 100) {
        return badRequest(res, 'Each capture_id must be a non-empty string');
      }
    }

    const packageId = typeof body.package_id === 'string' ? body.package_id : null;

    // Only include captures that belong to this workspace.
    const { data: validCaptures, error: capturesError } = await supabase
      .from('captures')
      .select('id')
      .eq('workspace_id', workspace.workspaceId)
      .in('id', captureIds);

    if (capturesError) {
      return serverError(res, capturesError);
    }

    const validIds = new Set((validCaptures || []).map((c: any) => c.id));
    const filteredIds = captureIds.filter((id) => validIds.has(id));

    if (filteredIds.length === 0) {
      return badRequest(res, 'No valid captures found in workspace');
    }

    const reportId = randomUUID();

    // Create the report record.
    const { error: reportError } = await supabase.from('reports').insert({
      id: reportId,
      workspace_id: workspace.workspaceId,
      package_id: packageId,
      generated_by: session.id,
      status: 'rendered',
    });

    if (reportError) {
      return serverError(res, reportError);
    }

    // Bulk-insert one report_images row per embedded capture.
    const reportImages = filteredIds.map((captureId) => ({
      id: randomUUID(),
      workspace_id: workspace.workspaceId,
      report_id: reportId,
      capture_id: captureId,
    }));

    const { error: imagesError } = await supabase.from('report_images').insert(reportImages);

    if (imagesError) {
      return serverError(res, imagesError);
    }

    // Advance all embedded captures to the terminal report state.
    const { error: updateError } = await supabase
      .from('captures')
      .update({ report_state: 'report_rendered' })
      .eq('workspace_id', workspace.workspaceId)
      .in('id', filteredIds);

    if (updateError) {
      return serverError(res, updateError);
    }

    console.info('[report:create]', {
      report_id: reportId,
      workspace_id: workspace.workspaceId,
      capture_count: filteredIds.length,
      generated_by: session.id,
    });

    return res.status(201).json({ report_id: reportId, capture_count: filteredIds.length });
  } catch (error) {
    if (error instanceof ValidationError) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}
