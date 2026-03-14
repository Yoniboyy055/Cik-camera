import { randomUUID } from 'node:crypto';
import {
  clearSessionCookie,
  hashPassword,
  readSession,
  setSessionCookie,
  verifyPassword,
} from '../_lib/auth.js';
import { badRequest, methodNotAllowed, readBody, serverError } from '../_lib/http.js';
import { enforceRateLimit } from '../_lib/rateLimit.js';
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { asObject, requiredEmail, requiredString, ValidationError } from '../_lib/validation.js';
import { resolveWorkspaceContext } from '../_lib/workspace.js';

interface LoginBody {
  email?: string;
  password?: string;
}

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
}

function getAction(req: any): string {
  const rawAction = req.query?.action;
  if (Array.isArray(rawAction)) {
    return rawAction[0] ?? '';
  }
  return String(rawAction ?? '');
}

async function handleLogin(req: any, res: any) {
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

async function handleRegister(req: any, res: any) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!enforceRateLimit(req, res, 'register', 10, 15 * 60 * 1000)) {
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = asObject(readBody<RegisterBody>(req));
    const name = requiredString(body.name, 'name', { min: 2, max: 100 });
    const email = requiredEmail(body.email);
    const password = requiredString(body.password, 'password', { min: 8, max: 200 });

    const { data: existing, error: lookupError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (lookupError) {
      return serverError(res, lookupError);
    }

    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const id = randomUUID();

    const { error: insertError } = await supabase.from('users').insert({
      id,
      name,
      email,
      password: hashPassword(password),
      role: 'worker',
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      return serverError(res, insertError);
    }

    let workspaceId = 'ws-default';
    const { data: membershipRows, error: membershipLookupError } = await supabase
      .from('workspace_memberships')
      .select('workspace_id')
      .eq('status', 'active')
      .limit(1);

    if (!membershipLookupError && membershipRows?.[0]?.workspace_id) {
      workspaceId = membershipRows[0].workspace_id;
    }

    await supabase.from('workspace_memberships').insert({
      id: randomUUID(),
      workspace_id: workspaceId,
      user_id: id,
      role: 'worker',
      status: 'active',
    }).then(() => null, () => null);

    return res.status(200).json({ user: { id, name, email, role: 'worker', workspace_id: workspaceId } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}

function handleLogout(req: any, res: any) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!enforceRateLimit(req, res, 'logout', 60, 60 * 1000)) {
    return;
  }

  clearSessionCookie(res);
  return res.status(200).json({ success: true });
}

function handleSession(req: any, res: any) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  if (!enforceRateLimit(req, res, 'session', 120, 60 * 1000)) {
    return;
  }

  const user = readSession(req);
  return res.status(200).json({ user });
}

export default async function handler(req: any, res: any) {
  const action = getAction(req);

  switch (action) {
    case 'login':
      return handleLogin(req, res);
    case 'logout':
      return handleLogout(req, res);
    case 'register':
      return handleRegister(req, res);
    case 'session':
      return handleSession(req, res);
    default:
      return res.status(404).json({ error: 'Not found' });
  }
}