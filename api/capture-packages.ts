import { randomUUID } from 'node:crypto';
import { methodNotAllowed, readBody, serverError } from './_lib/http.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

interface CreatePackageBody {
  user_id?: string;
  project_id?: string | null;
  task_template_id?: string | null;
  custom_project_name?: string | null;
  custom_task_text?: string | null;
}

function normalizeNullableText(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = readBody<CreatePackageBody>(req);
    const customProjectName = normalizeNullableText(body.custom_project_name);
    const customTaskText = normalizeNullableText(body.custom_task_text);
    const projectId = body.project_id || null;
    const taskTemplateId = body.task_template_id || null;

    if (!body.user_id || (!projectId && !customProjectName)) {
      return res.status(400).json({ error: 'user_id and either project_id or custom_project_name are required' });
    }

    const id = randomUUID();

    const { error } = await supabase.from('capture_packages').insert({
      id,
      user_id: body.user_id,
      project_id: projectId,
      custom_project_name: customProjectName,
      task_template_id: taskTemplateId,
      custom_task_text: customTaskText,
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
