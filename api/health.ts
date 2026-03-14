import { enforceRateLimit } from './_lib/rateLimit.js';

export default function handler(req: any, res: any) {
  if (!enforceRateLimit(req, res, 'health', 60, 60 * 1000)) {
    return;
  }

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}
