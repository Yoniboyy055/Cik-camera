import { methodNotAllowed, serverError } from '../../_lib/http';
import { supabaseAdmin } from '../../_lib/supabaseAdmin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  const idParam = req.query?.id;
  const templateId = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!templateId) {
    return res.status(400).json({ error: 'Task template id is required' });
  }

  try {
    const { data, error } = await supabaseAdmin
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
