import { randomUUID } from 'node:crypto';
import { methodNotAllowed, readBody, serverError } from './_lib/http';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

interface RegisterBody {
  name?: string;
  email?: string;
  password?: string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = readBody<RegisterBody>(req);
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

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
      password,
      role: 'worker',
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      return serverError(res, insertError);
    }

    return res.status(200).json({ user: { id, name, email, role: 'worker' } });
  } catch (error) {
    return serverError(res, error);
  }
}
