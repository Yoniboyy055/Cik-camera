import { clearSessionCookie } from './_lib/auth.js';
import { methodNotAllowed } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rateLimit.js';

export default function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST']);
  }

  if (!enforceRateLimit(req, res, 'logout', 60, 60 * 1000)) {
    return;
  }

  clearSessionCookie(res);
  return res.status(200).json({ success: true });
}