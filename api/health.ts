import { supabaseAdmin } from './_lib/supabaseAdmin';

export default async function handler(req: any, res: any) {
  const checks: Record<string, string> = {};

  try {
    const { error } = await supabaseAdmin.from('users').select('id').limit(1);
    checks.database = error ? `fail: ${error.message}` : 'ok';
  } catch (e) {
    checks.database = `fail: ${e instanceof Error ? e.message : 'unknown'}`;
  }

  const healthy = Object.values(checks).every((v) => v === 'ok');

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
  });
}
