import { randomUUID } from 'node:crypto';
import { methodNotAllowed, readBody, serverError } from './_lib/http';
import { supabaseAdmin } from './_lib/supabaseAdmin';

interface CreatePackageBody {
  user_id?: string;
  project_id?: string;
  task_template_id?: string | null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const body = readBody<CreatePackageBody>(req);

    if (!body.user_id || !body.project_id) {
      return res.status(400).json({ error: 'user_id and project_id are required' });
    }

    const id = randomUUID();

    const { error } = await supabaseAdmin.from('capture_packages').insert({
      id,
      user_id: body.user_id,
      project_id: body.project_id,
      task_template_id: body.task_template_id || null,
      status: 'in_progress',
    });

    if (error) {
      return serverError(res, error);
    }

    return res.status(200).json({ id });
  } catch (error) {
    return serverError(res, error);
  }
}
