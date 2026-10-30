/**
 * CORS header generation -- TypeScript port of api/_cors.js.
 *
 * Identical ALLOWED_ORIGIN_PATTERNS and logic, with methods hardcoded
 * to 'POST, OPTIONS' (all sebuf routes are POST).
 */

declare const process: { env: Record<string, string | undefined> };

const PRODUCTION_PATTERNS: RegExp[] = [
  /^https:\/\/(.*\.)?worldmonitor\.app$/,
  /^https:\/\/worldmonitor(-[a-z0-9-]+)?\.vercel\.app$/,
  /^https:\/\/(.*\.)?c4dash\.org$/,
  /^https?:\/\/tauri\.localhost(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.tauri\.localhost(:\d+)?$/i,
  /^tauri:\/\/localhost$/,
  /^asset:\/\/localhost$/,
];

const DEV_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

const ALLOWED_ORIGIN_PATTERNS: RegExp[] =
  process.env.NODE_ENV === 'production'
    ? PRODUCTION_PATTERNS
    : [...PRODUCTION_PATTERNS, ...DEV_PATTERNS];

function isAllowedOrigin(origin: string, host?: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) return true;

  // Custom origins from environment variable (e.g. self-hosted Linux VPS)
  const envOrigins = process.env.ALLOWED_ORIGINS || process.env.VITE_ALLOWED_ORIGINS;
  if (envOrigins) {
    const list = envOrigins.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.includes('*') || list.includes(origin)) return true;
  }

  // Same-origin matching against Host header
  if (host) {
    try {
      const parsed = new URL(origin);
      if (parsed.host === host) return true;
    } catch {}
  }

  return false;
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const host = req.headers.get('host') || '';
  const allowOrigin = isAllowedOrigin(origin, host) ? origin : 'https://worldmonitor.app';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WorldMonitor-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function isDisallowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('host') || '';
  return !isAllowedOrigin(origin, host);
}
