import { hashPassword, setSessionCookie } from './_lib/auth.js';
import { badRequest, methodNotAllowed, readBody, serverError } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { asObject, requiredEmail, requiredString, ValidationError } from './_lib/validation.js';
import { verifyPassword } from './_lib/auth.js';
import { resolveWorkspaceContext } from './_lib/workspace.js';

interface LoginBody {
  email?: string;
  password?: string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!enforceRateLimit(req, res, 'login', 10, 15 * 60 * 1000)) {
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = asObject(readBody<LoginBody>(req));
    const email = requiredEmail(body.email);
    const password = requiredString(body.password, 'password', { min: 8, max: 200 });

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role, password')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      return serverError(res, error);
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordCheck = verifyPassword(password, String((user as any).password ?? ''));
    if (!passwordCheck.ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (passwordCheck.needsUpgrade) {
      await supabase
        .from('users')
        .update({ password: hashPassword(password) })
        .eq('id', user.id);
    }

    const workspace = await resolveWorkspaceContext(supabase, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: workspace.role,
      workspace_id: workspace.workspaceId,
    };
    setSessionCookie(res, sessionUser);

    return res.status(200).json({ user: sessionUser });
  } catch (error) {
    if (error instanceof ValidationError) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}
