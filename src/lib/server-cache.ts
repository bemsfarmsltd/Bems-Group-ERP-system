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
 * Reads a cached value if it has not expired.
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
 * Invalidates all cache entries whose key starts with `prefix`.
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

