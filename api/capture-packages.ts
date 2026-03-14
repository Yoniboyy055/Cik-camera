import { randomUUID } from 'node:crypto';
import { requireSession } from './_lib/auth.js';
import { badRequest, methodNotAllowed, readBody, serverError } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { asObject, optionalString, ValidationError } from './_lib/validation.js';

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

  if (!enforceRateLimit(req, res, 'capture-packages:create', 60, 60 * 1000)) {
    return;
  }

  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = asObject(readBody<CreatePackageBody>(req));
    const customProjectName = normalizeNullableText(
      optionalString(body.custom_project_name, 'custom_project_name', { allowNull: true }) ?? null,
    );
    const customTaskText = normalizeNullableText(
      optionalString(body.custom_task_text, 'custom_task_text', { allowNull: true }) ?? null,
    );
    const projectId = optionalString(body.project_id, 'project_id', { allowNull: true }) ?? null;
    const taskTemplateId = optionalString(body.task_template_id, 'task_template_id', { allowNull: true }) ?? null;

    if (!projectId && !customProjectName) {
      return badRequest(res, 'either project_id or custom_project_name is required');
    }

    const id = randomUUID();

    const { error } = await supabase.from('capture_packages').insert({
      id,
      user_id: session.id,
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
    if (error instanceof ValidationError) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}
