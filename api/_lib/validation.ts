export class ValidationError extends Error {}

export function asObject(value: unknown, label = 'body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

export function requiredString(
  value: unknown,
  label: string,
  opts?: { min?: number; max?: number },
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ValidationError(`${label} is required`);
  }
  if (opts?.min && trimmed.length < opts.min) {
    throw new ValidationError(`${label} must be at least ${opts.min} characters`);
  }
  if (opts?.max && trimmed.length > opts.max) {
    throw new ValidationError(`${label} must be at most ${opts.max} characters`);
  }
  return trimmed;
}

export function optionalString(
  value: unknown,
  label: string,
  opts?: { max?: number; allowNull?: boolean },
): string | null | undefined {
  if (value == null) {
    return opts?.allowNull ? null : undefined;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return opts?.allowNull ? null : undefined;
  }
  if (opts?.max && trimmed.length > opts.max) {
    throw new ValidationError(`${label} must be at most ${opts.max} characters`);
  }
  return trimmed;
}

export function optionalNumber(value: unknown, label: string): number | null | undefined {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new ValidationError(`${label} must be a valid number`);
  }
  return value;
}

export function optionalEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ValidationError(`${label} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function requiredEmail(value: unknown): string {
  const email = requiredString(value, 'email', { max: 320 }).toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!ok) {
    throw new ValidationError('email must be a valid email address');
  }
  return email;
}