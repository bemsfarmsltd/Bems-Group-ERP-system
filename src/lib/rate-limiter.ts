import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getRedisClient } from '@/lib/redis';

export type RateLimitOptions = { windowMs: number; maxAttempts: number; blockDurationMs?: number };
export type RateLimitResult = { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number };
function identifierHash(identifier: string) { return createHash('sha256').update(identifier).digest('hex'); }

const memoryRateLimits = new Map<string, { attempts: number; windowStartedAt: number; blockedUntil: number | null }>();
let tableEnsured = false;

async function ensureRateLimitTable(): Promise<void> {
  if (tableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SecurityRateLimit" (
      "key" TEXT PRIMARY KEY,
      "attempts" INTEGER NOT NULL,
      "windowStartedAt" TIMESTAMPTZ NOT NULL,
      "blockedUntil" TIMESTAMPTZ,
      "expiresAt" TIMESTAMPTZ NOT NULL
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SecurityRateLimit_expiresAt_idx" ON "SecurityRateLimit" ("expiresAt");
  `);
  tableEnsured = true;
}

function checkMemoryRateLimit(key: string, windowMs: number, max: number, blockMs: number): RateLimitResult {
  const now = Date.now();
  const current = memoryRateLimits.get(key);
  if (!current || (current.blockedUntil && current.blockedUntil <= now) || (!current.blockedUntil && current.windowStartedAt + windowMs <= now)) {
    memoryRateLimits.set(key, { attempts: 1, windowStartedAt: now, blockedUntil: null });
    return { allowed: true, remainingAttempts: Math.max(0, max - 1) };
  }
  if (current.blockedUntil && current.blockedUntil > now) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000)),
    };
  }
  const nextAttempts = current.attempts + 1;
  const blockedUntil = nextAttempts > max ? now + blockMs : null;
  memoryRateLimits.set(key, { attempts: nextAttempts, windowStartedAt: current.windowStartedAt, blockedUntil });
  return {
    allowed: !blockedUntil && nextAttempts <= max,
    remainingAttempts: Math.max(0, max - nextAttempts),
    ...(blockedUntil ? { retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1000)) } : {}),
  };
}

async function queryRateLimitRow(key: string, windowMs: number, max: number, blockMs: number) {
  return prisma.$queryRaw<Array<{ attempts: number; blockedUntil: Date | null }>>`
    INSERT INTO "SecurityRateLimit" ("key", "attempts", "windowStartedAt", "blockedUntil", "expiresAt")
    VALUES (${key}, 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP + (${windowMs + blockMs} * interval '1 millisecond'))
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "SecurityRateLimit"."blockedUntil" > CURRENT_TIMESTAMP THEN "SecurityRateLimit"."attempts"
        WHEN "SecurityRateLimit"."windowStartedAt" + (${windowMs} * interval '1 millisecond') <= CURRENT_TIMESTAMP THEN 1
        ELSE "SecurityRateLimit"."attempts" + 1 END,
      "windowStartedAt" = CASE WHEN "SecurityRateLimit"."blockedUntil" > CURRENT_TIMESTAMP THEN "SecurityRateLimit"."windowStartedAt"
        WHEN "SecurityRateLimit"."windowStartedAt" + (${windowMs} * interval '1 millisecond') <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP
        ELSE "SecurityRateLimit"."windowStartedAt" END,
      "blockedUntil" = CASE WHEN "SecurityRateLimit"."blockedUntil" > CURRENT_TIMESTAMP THEN "SecurityRateLimit"."blockedUntil"
        WHEN "SecurityRateLimit"."windowStartedAt" + (${windowMs} * interval '1 millisecond') <= CURRENT_TIMESTAMP THEN NULL
        WHEN "SecurityRateLimit"."attempts" >= ${max} THEN CURRENT_TIMESTAMP + (${blockMs} * interval '1 millisecond') ELSE NULL END,
      "expiresAt" = CURRENT_TIMESTAMP + (${windowMs + blockMs} * interval '1 millisecond')
    RETURNING "attempts", "blockedUntil"
  `;
}

async function checkRedisRateLimit(
  key: string,
  windowMs: number,
  max: number,
  blockMs: number
): Promise<RateLimitResult | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const countKey = `bems:rl:cnt:${key}`;
  const blockKey = `bems:rl:blk:${key}`;
  try {
    const blockTtlMs = await redis.pttl(blockKey);
    if (blockTtlMs > 0) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(blockTtlMs / 1000)),
      };
    }

    const attempts = await redis.incr(countKey);
    if (attempts === 1) {
      await redis.pexpire(countKey, windowMs);
    }

    if (attempts > max) {
      await redis.set(blockKey, '1', 'PX', blockMs);
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(blockMs / 1000)),
      };
    }

    return {
      allowed: true,
      remainingAttempts: Math.max(0, max - attempts),
    };
  } catch {
    return null;
  }
}

/** Distributed rate limiter: Redis primary, PostgreSQL secondary, process memory fallback. */
export async function checkRateLimit(identifier: string, options: RateLimitOptions): Promise<RateLimitResult> {
  const key = identifierHash(identifier);
  const windowMs = Math.max(1000, options.windowMs);
  const blockMs = Math.max(1000, options.blockDurationMs ?? windowMs);
  const max = Math.max(1, options.maxAttempts);

  const redisResult = await checkRedisRateLimit(key, windowMs, max, blockMs);
  if (redisResult) return redisResult;

  try {
    let rows: Array<{ attempts: number; blockedUntil: Date | null }>;
    try {
      rows = await queryRateLimitRow(key, windowMs, max, blockMs);
    } catch (firstErr) {
      await ensureRateLimitTable();
      rows = await queryRateLimitRow(key, windowMs, max, blockMs);
    }
    const row = rows[0];
    if (!row) return checkMemoryRateLimit(key, windowMs, max, blockMs);
    const blocked = row.blockedUntil && new Date(row.blockedUntil).getTime() > Date.now();
    return {
      allowed: !blocked && row.attempts <= max,
      remainingAttempts: Math.max(0, max - row.attempts),
      ...(blocked ? { retryAfterSeconds: Math.max(1, Math.ceil((new Date(row.blockedUntil!).getTime() - Date.now()) / 1000)) } : {}),
    };
  } catch (error) {
    console.error('Shared rate-limit storage unavailable, falling back to process memory:', error);
    return checkMemoryRateLimit(key, windowMs, max, blockMs);
  }
}

export async function resetRateLimit(identifier: string): Promise<void> {
  const key = identifierHash(identifier);
  memoryRateLimits.delete(key);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(`bems:rl:cnt:${key}`, `bems:rl:blk:${key}`);
    } catch {}
  }
  try {
    await prisma.$executeRaw`DELETE FROM "SecurityRateLimit" WHERE "key" = ${key}`;
  } catch {}
}

export function getClientIp(req: Request): string {
  const customHeader = process.env.BEMS_TRUSTED_CLIENT_IP_HEADER;
  if (customHeader) {
    const customVal = req.headers.get(customHeader)?.split(',')[0].trim();
    if (customVal && customVal !== 'direct') return customVal.slice(0, 80);
  }

  // Inspect standard reverse proxy / CDN headers (Cloudflare, Nginx, Hostinger, Starlink)
  const cfConnectingIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp && cfConnectingIp !== 'direct') return cfConnectingIp.slice(0, 80);

  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp && realIp !== 'direct') return realIp.slice(0, 80);

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp && firstIp !== 'direct') return firstIp.slice(0, 80);
  }

  return '127.0.0.1';
}
