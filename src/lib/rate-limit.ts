import { getRedisClient } from '@/lib/redis';
import { logger } from '@/lib/logger';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

const localCounters = new Map<string, { count: number; resetAt: number }>();

/**
 * Distributed fixed-window rate limiter backed by Redis (INCR + EXPIRE).
 * Gracefully falls back to local memory if Redis is unconfigured or temporarily unreachable.
 */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const safeId = identifier.trim().toLowerCase() || 'anonymous';
  const redisKey = `bems:rl:${scope}:${safeId}`;
  const redis = getRedisClient();

  if (redis) {
    try {
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, windowSeconds);
      }
      const ttl = await redis.ttl(redisKey);
      const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        limit,
        retryAfterSeconds,
      };
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), scope }, 'Redis rate limit fallback to local memory');
    }
  }

  const now = Date.now();
  const entry = localCounters.get(redisKey);
  if (!entry || entry.resetAt <= now) {
    localCounters.set(redisKey, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: Math.max(0, limit - 1), limit, retryAfterSeconds: windowSeconds };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    limit,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}
