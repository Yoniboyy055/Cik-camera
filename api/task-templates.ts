import { requireSession } from './_lib/auth.js';
import { methodNotAllowed, serverError } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  if (!enforceRateLimit(req, res, 'task-templates', 120, 60 * 1000)) {
    return;
  }

  if (!requireSession(req, res)) {
    return;
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('task_templates')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });

    if (error) {
      return serverError(res, error);
    }

    return res.status(200).json(data || []);
  } catch (error) {
    return serverError(res, error);
  }
}
