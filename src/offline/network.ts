/**
 * GrandProof V2 — Hybrid Network Detection
 * Combines navigator.onLine with a lightweight /api/health ping.
 * Ping-based check is throttled to avoid hammering the server.
 */

export type NetworkStatus = 'online' | 'offline' | 'reconnecting';

const PING_URL = '/api/health';
const PING_TIMEOUT_MS = 4_000;
const PING_THROTTLE_MS = 10_000;

let _lastPingAt = 0;
let _lastPingResult: boolean | null = null;

/** One-shot connectivity check — uses cached result if within throttle window. */
export async function checkConnectivity(): Promise<boolean> {
  if (!navigator.onLine) return false;

  const now = Date.now();
  if (_lastPingResult !== null && now - _lastPingAt < PING_THROTTLE_MS) {
    return _lastPingResult;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    const resp = await fetch(PING_URL, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    _lastPingAt = Date.now();
    _lastPingResult = resp.ok;
    return resp.ok;
  } catch {
    _lastPingAt = Date.now();
    _lastPingResult = false;
    return false;
  }
}

/** Subscribe to network status changes. Returns an unsubscribe function. */
export function subscribeNetworkStatus(
  onChange: (status: NetworkStatus) => void
): () => void {
  let _current: NetworkStatus = navigator.onLine ? 'online' : 'offline';

  const handleOnline = async () => {
    onChange('reconnecting');
    const alive = await checkConnectivity();
    const next: NetworkStatus = alive ? 'online' : 'offline';
    _current = next;
    onChange(next);
  };

  const handleOffline = () => {
    _current = 'offline';
    onChange('offline');
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Periodic ping while "online" to catch captive portals
  const interval = setInterval(async () => {
    if (_current === 'online') {
      const alive = await checkConnectivity();
      if (!alive && _current === 'online') {
        _current = 'offline';
        onChange('offline');
      }
    }
  }, 30_000);

  // Fire initial status
  onChange(_current);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    clearInterval(interval);
  };
}
