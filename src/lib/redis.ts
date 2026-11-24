import Redis from 'ioredis';
import { logger } from '@/lib/logger';

const globalForRedis = globalThis as unknown as {
  bemsRedisClient?: Redis | null;
};

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim());
}

export function getRedisClient(): Redis | null {
  if (!isRedisConfigured()) return null;
  if (globalForRedis.bemsRedisClient !== undefined) {
    return globalForRedis.bemsRedisClient;
  }

  const client = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  client.on('error', (err) => {
    logger.warn({ err: err.message }, 'Redis client connection warning');
  });

  globalForRedis.bemsRedisClient = client;
  return client;
}

export function createRedisSubscriber(): Redis | null {
  if (!isRedisConfigured()) return null;
  const sub = new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  sub.on('error', (err) => {
    logger.warn({ err: err.message }, 'Redis subscriber warning');
  });
  return sub;
}

export async function pingRedis(): Promise<{
  status: 'connected' | 'degraded' | 'disabled';
  latencyMs: number | null;
}> {
  if (!isRedisConfigured()) {
    return { status: 'disabled', latencyMs: null };
  }
  const client = getRedisClient();
  if (!client) {
    return { status: 'disabled', latencyMs: null };
  }

  const startedAt = Date.now();
  try {
    const pong = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Redis ping timeout')), 1500)),
    ]);
    if (pong === 'PONG') {
      return { status: 'connected', latencyMs: Date.now() - startedAt };
    }
    return { status: 'degraded', latencyMs: Date.now() - startedAt };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'Redis ping failed');
    return { status: 'degraded', latencyMs: null };
  }
}

/**
 * Acquires an atomic distributed lock via Redis SET NX PX.
 * Returns the lock token if acquired, or null if another worker holds the lock.
 * When Redis is unconfigured/unreachable, returns 'local-fallback' so single-node jobs still proceed.
 */
export async function acquireDistributedLock(resourceKey: string, ttlMs = 30_000): Promise<string | null> {
  const client = getRedisClient();
  if (!client) return 'local-fallback';

  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const fullKey = `bems:lock:${resourceKey}`;
  try {
    const result = await client.set(fullKey, token, 'PX', Math.max(1000, ttlMs), 'NX');
    return result === 'OK' ? token : null;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), resourceKey }, 'Redis lock acquire failed; falling back');
    return 'local-fallback';
  }
}

/**
 * Releases a distributed lock only if the caller still owns the token (compare-and-del Lua script).
 */
export async function releaseDistributedLock(resourceKey: string, token: string | null): Promise<void> {
  if (!token || token === 'local-fallback') return;
  const client = getRedisClient();
  if (!client) return;

  const fullKey = `bems:lock:${resourceKey}`;
  const lua = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
  try {
    await client.eval(lua, 1, fullKey, token);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), resourceKey }, 'Redis lock release warning');
  }
}
