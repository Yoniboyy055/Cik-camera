import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { optionalEnv, requireEnv } from './env.js';

const SESSION_COOKIE = 'gp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface SessionPayload extends SessionUser {
  exp: number;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getSessionSecret(): string {
  return optionalEnv('SESSION_SECRET') || requireEnv('SUPABASE_SERVICE_ROLE_KEY');
}

function sign(value: string): string {
  return createHmac('sha256', getSessionSecret()).update(value).digest('base64url');
}

function appendCookie(res: any, cookie: string) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  const next = Array.isArray(current) ? [...current, cookie] : [String(current), cookie];
  res.setHeader('Set-Cookie', next);
}

function buildCookie(name: string, value: string, maxAgeSeconds: number): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function parseCookies(req: any): Record<string, string> {
  const header = req.headers?.cookie;
  if (!header || typeof header !== 'string') return {};
  return Object.fromEntries(
    header.split(';').map((chunk: string) => {
      const [key, ...rest] = chunk.trim().split('=');
      return [key, rest.join('=')];
    }),
  );
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedPassword: string): { ok: boolean; needsUpgrade: boolean } {
  if (!storedPassword.startsWith('scrypt$')) {
    return { ok: storedPassword === password, needsUpgrade: storedPassword === password };
  }

  const [, salt, expected] = storedPassword.split('$');
  if (!salt || !expected) return { ok: false, needsUpgrade: false };
  const actual = scryptSync(password, salt, 64).toString('hex');
  const ok = timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  return { ok, needsUpgrade: false };
}

export function setSessionCookie(res: any, user: SessionUser) {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  appendCookie(res, buildCookie(SESSION_COOKIE, `${body}.${sign(body)}`, SESSION_TTL_SECONDS));
}

export function clearSessionCookie(res: any) {
  appendCookie(res, buildCookie(SESSION_COOKIE, '', 0));
}

export function readSession(req: any): SessionUser | null {
  const cookies = parseCookies(req);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;

  const [body, signature] = raw.split('.');
  if (!body || !signature || sign(body) !== signature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
    if (!payload?.id || !payload?.email || !payload?.role || !payload?.name) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { id: payload.id, name: payload.name, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

export function requireSession(req: any, res: any, roles?: string[]): SessionUser | null {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  if (roles && !roles.includes(session.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return session;
}