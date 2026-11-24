import { getRedisClient } from '@/lib/redis';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const globalForServerCache = globalThis as unknown as {
  bemsServerCache?: Map<string, CacheEntry<unknown>>;
};

const CACHE =
  globalForServerCache.bemsServerCache ??
  (globalForServerCache.bemsServerCache = new Map<string, CacheEntry<unknown>>());

/**
 * Reads a cached value synchronously from local memory if it has not expired.
 */
export function getServerCache<T>(key: string): T | null {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    CACHE.delete(key);
    return null;
  }
  return entry.value as T;
}

/**
 * Stores a value in the in-memory server cache for `ttlMs` milliseconds.
 */
export function setServerCache<T>(key: string, value: T, ttlMs = 12_000): void {
  if (CACHE.size > 500) {
    const now = Date.now();
    for (const [k, v] of CACHE.entries()) {
      if (v.expiresAt <= now) CACHE.delete(k);
    }
  }
  CACHE.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Invalidates all local cache entries whose key starts with `prefix`.
 */
export function invalidateServerCache(prefix?: string): void {
  if (!prefix) {
    CACHE.clear();
    return;
  }
  for (const key of CACHE.keys()) {
    if (key.startsWith(prefix)) {
      CACHE.delete(key);
    }
  }
}

/**
 * Distributed cache read (uses Redis when REDIS_URL is configured, else local memory).
 */
export async function getDistributedCache<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(`bems:cache:${key}`);
      if (raw) {
        return JSON.parse(raw) as T;
      }
      return null;
    } catch {
      return getServerCache<T>(key);
    }
  }
  return getServerCache<T>(key);
}

/**
 * Distributed cache write (uses Redis when REDIS_URL is configured, else local memory).
 */
export async function setDistributedCache<T>(key: string, value: T, ttlMs = 15_000): Promise<void> {
  setServerCache(key, value, ttlMs);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(`bems:cache:${key}`, JSON.stringify(value), 'PX', Math.max(1000, ttlMs));
    } catch {}
  }
}

/**
 * Non-blocking distributed cache invalidation by prefix using Redis SCAN + UNLINK.
 */
export async function invalidateDistributedCache(prefix?: string): Promise<void> {
  invalidateServerCache(prefix);
  const redis = getRedisClient();
  if (!redis) return;

  const pattern = prefix ? `bems:cache:${prefix}*` : 'bems:cache:*';
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.unlink(...keys);
      }
    } while (cursor !== '0');
  } catch {}
}

/**
 * Read-through distributed cache helper.
 */
export async function withDistributedCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = await getDistributedCache<T>(key);
  if (cached !== null) return cached;
  const fresh = await loader();
  await setDistributedCache(key, fresh, ttlMs);
  return fresh;
}
