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
