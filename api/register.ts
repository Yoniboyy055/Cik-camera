import { randomUUID } from 'node:crypto';
import { hashPassword } from './_lib/auth.js';
import { badRequest, methodNotAllowed, readBody, serverError } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { asObject, requiredEmail, requiredString, ValidationError } from './_lib/validation.js';

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
}

export default async function handler(req: any, res: any) {
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

    return res.status(200).json({ user: { id, name, email, role: 'worker' } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}
