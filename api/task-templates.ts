import { methodNotAllowed, serverError } from './_lib/http';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
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
