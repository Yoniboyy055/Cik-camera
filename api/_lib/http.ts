export function methodNotAllowed(res: any, allowed: string[]) {
  res.setHeader('Allow', allowed.join(', '));
  return res.status(405).json({ error: 'Method not allowed' });
}

export function badRequest(res: any, message: string) {
  return res.status(400).json({ error: message });
}

export function unauthorized(res: any, message = 'Authentication required') {
  return res.status(401).json({ error: message });
}

export function forbidden(res: any, message = 'Forbidden') {
  return res.status(403).json({ error: message });
}

export function serverError(res: any, error: unknown) {
  let message = 'Internal server error';
  if (error instanceof Error) {
    message = error.message;
  } else if (error !== null && typeof error === 'object' && 'message' in error) {
    message = String((error as { message: unknown }).message);
  }
  return res.status(500).json({ error: message });
}

export function readBody<T>(req: any): T {
  if (!req.body) {
    return {} as T;
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body) as T;
  }

  return req.body as T;
}
