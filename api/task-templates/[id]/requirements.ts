import { requireSession } from '../../_lib/auth.js';
import { methodNotAllowed, serverError } from '../../_lib/http.js';
import { enforceRateLimit } from '../../_lib/rateLimit.js';
import { getSupabaseAdmin } from '../../_lib/supabaseAdmin.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  if (!enforceRateLimit(req, res, 'task-template-requirements', 120, 60 * 1000)) {
    return;
  }

  if (!requireSession(req, res)) {
    return;
  }

  const idParam = req.query?.id;
  const templateId = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!templateId) {
    return res.status(400).json({ error: 'Task template id is required' });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('task_template_requirements')
      .select('*')
      .eq('task_template_id', templateId)
      .order('required_order', { ascending: true });

    if (error) {
      return serverError(res, error);
    }

    return res.status(200).json(data || []);
  } catch (error) {
    return serverError(res, error);
  }
}
