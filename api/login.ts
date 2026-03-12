import { methodNotAllowed, readBody, serverError } from './_lib/http';
import { getSupabaseAdmin } from './_lib/supabaseAdmin';

interface LoginBody {
  email?: string;
  password?: string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = readBody<LoginBody>(req);
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role')
      .eq('email', email)
      .eq('password', password)
      .maybeSingle();

    if (error) {
      return serverError(res, error);
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    return serverError(res, error);
  }
}
