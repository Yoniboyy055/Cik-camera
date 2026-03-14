import { readSession } from './_lib/auth.js';
import { methodNotAllowed } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rateLimit.js';

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET']);
  }

  if (!enforceRateLimit(req, res, 'session', 120, 60 * 1000)) {
    return;
  }

  const user = readSession(req);
  return res.status(200).json({ user });
}