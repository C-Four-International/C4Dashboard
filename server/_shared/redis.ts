declare const process: { env: Record<string, string | undefined> };

/**
 * Environment-based key prefix to avoid collisions when multiple deployments
 * share the same Upstash Redis instance (M-6 fix).
 */
function getKeyPrefix(): string {
  const env = process.env.VERCEL_ENV; // 'production' | 'preview' | 'development'
  if (!env || env === 'production') return '';
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || 'dev';
  return `${env}:${sha}:`;
}

let cachedPrefix: string | undefined;
function prefixKey(key: string): string {
  if (cachedPrefix === undefined) cachedPrefix = getKeyPrefix();
  if (!cachedPrefix) return key;
  return `${cachedPrefix}${key}`;
}

const L1_CACHE_TTL_MS = 15_000;
const l1Cache = new Map<string, { value: unknown; expiresAt: number }>();

function l1Get(key: string): unknown | null {
  const entry = l1Cache.get(key);
  if (entry) {
    if (entry.expiresAt > Date.now()) return entry.value;
    l1Cache.delete(key);
  }
  return null;
}

function l1Set(key: string, value: unknown, ttlMs: number = L1_CACHE_TTL_MS): void {
  if (l1Cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of l1Cache.entries()) {
      if (v.expiresAt <= now) l1Cache.delete(k);
    }
    if (l1Cache.size > 1000) l1Cache.clear();
  }
  l1Cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function getCachedJson(key: string): Promise<unknown | null> {
  const prefixed = prefixKey(key);
  const l1Value = l1Get(prefixed);
  if (l1Value !== null) return l1Value;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const resp = await fetch(`${url}/get/${encodeURIComponent(prefixed)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3_000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { result?: string };
    if (data.result) {
      const parsed = JSON.parse(data.result);
      l1Set(prefixed, parsed);
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const prefixed = prefixKey(key);
  l1Set(prefixed, value, Math.min(L1_CACHE_TTL_MS, ttlSeconds * 1000));

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    // Atomic SET with EX — single call avoids race between SET and EXPIRE (C-3 fix)
    await fetch(`${url}/set/${encodeURIComponent(prefixed)}/${encodeURIComponent(JSON.stringify(value))}/EX/${ttlSeconds}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3_000),
    });
  } catch { /* best-effort */ }
}

/**
 * Batch GET using Upstash pipeline API — single HTTP round-trip for N keys.
 * Returns a Map of key → parsed JSON value (missing/failed keys omitted).
 */
export async function getCachedJsonBatch(keys: string[]): Promise<Map<string, unknown>> {
  const result = new Map<string, unknown>();
  if (keys.length === 0) return result;

  const missingKeys: string[] = [];
  for (const k of keys) {
    const l1Value = l1Get(prefixKey(k));
    if (l1Value !== null) {
      result.set(k, l1Value);
    } else {
      missingKeys.push(k);
    }
  }

  if (missingKeys.length === 0) return result;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return result;

  try {
    const pipeline = missingKeys.map((k) => ['GET', prefixKey(k)]);
    const resp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
      signal: AbortSignal.timeout(3_000),
    });
    if (!resp.ok) return result;

    const data = (await resp.json()) as Array<{ result?: string }>;
    for (let i = 0; i < missingKeys.length; i++) {
      const raw = data[i]?.result;
      if (raw) {
        try { 
          const parsed = JSON.parse(raw);
          result.set(missingKeys[i]!, parsed);
          l1Set(prefixKey(missingKeys[i]!), parsed);
        } catch { /* skip malformed */ }
      }
    }
  } catch { /* best-effort */ }
  return result;
}

/**
 * In-flight request coalescing map.
 * When multiple concurrent requests hit the same cache key during a miss,
 * only the first triggers the upstream fetch — others await the same promise.
 * This eliminates duplicate upstream API calls within a single Edge Function invocation.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Check cache, then fetch with coalescing on miss.
 * Concurrent callers for the same key share a single upstream fetch + Redis write.
 */
export async function cachedFetchJson<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T | null> {
  const cached = await getCachedJson(key);
  if (cached !== null) return cached as T;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher()
    .then(async (result) => {
      if (result != null) {
        await setCachedJson(key, result, ttlSeconds);
      }
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/**
 * Like cachedFetchJson but reports the data source.
 * Use when callers need to distinguish cache hits from fresh fetches
 * (e.g. to set provider/cached metadata on responses).
 *
 * Returns { data, source } where source is:
 *   'cache'  — served from Redis
 *   'fresh'  — fetcher ran (leader) or joined an in-flight fetch (follower)
 */
export async function cachedFetchJsonWithMeta<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T | null; source: 'cache' | 'fresh' }> {
  const cached = await getCachedJson(key);
  if (cached !== null) return { data: cached as T, source: 'cache' };

  const existing = inflight.get(key);
  if (existing) {
    const data = (await existing) as T;
    return { data, source: 'fresh' };
  }

  const promise = fetcher()
    .then(async (result) => {
      if (result != null) {
        await setCachedJson(key, result, ttlSeconds);
      }
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  const data = await promise;
  return { data, source: 'fresh' };
}

/**
 * Basic fixed-window rate limiter using Upstash pipeline.
 * Returns true if allowed, false if limit exceeded.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return true; // Fail open if no redis configured

  const prefixedKey = prefixKey(key);
  try {
    const pipeline = [
      ['INCR', prefixedKey],
      ['EXPIRE', prefixedKey, windowSeconds.toString(), 'NX']
    ];
    
    const resp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
      signal: AbortSignal.timeout(3_000),
    });
    
    if (!resp.ok) return true; // Fail open on error
    const data = await resp.json() as Array<{ result?: string | number }>;
    
    const countRaw = data[0]?.result;
    const count = typeof countRaw === 'number' ? countRaw : parseInt(String(countRaw), 10);
    
    if (!isNaN(count) && count > limit) {
      return false; // Rate limit exceeded
    }
  } catch {
    // Fail open
  }
  return true;
}

