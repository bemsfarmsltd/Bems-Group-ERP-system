import { hasStaffAppModuleAccess, staffModuleForApiPath } from '@/lib/staff-modules';
import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { NextRequest, NextResponse } from 'next/server';
import {
  type AuthenticatedEmployee,
  getAuthenticatedEmployee,
  isReadOnlyEmployee,
} from '@/lib/auth';
import {
  buildApiCacheKey,
  resolveGetCachePolicy,
  resolveInvalidationPrefixes,
} from '@/lib/cache-policy';
import {
  getDistributedCache,
  invalidateDistributedCache,
  setDistributedCache,
} from '@/lib/server-cache';

export type NextRouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => Promise<Response> | Response;

export type NextRouteModule = {
  GET?: NextRouteHandler;
  POST?: NextRouteHandler;
  PUT?: NextRouteHandler;
  PATCH?: NextRouteHandler;
  DELETE?: NextRouteHandler;
  OPTIONS?: NextRouteHandler;
  HEAD?: NextRouteHandler;
};

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const READ_ONLY_AUTH_ALLOWLIST = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/staff/onboard/complete',
  '/api/ai/chat',
  '/api/attendance/punch',
  '/api/attendance/verify-geofence',
]);

/**
 * Global server-side read-only enforcement guard.
 * Blocks all non-auth mutating requests from read-only CUSTOM_ADMIN accounts
 * before any route handler is invoked.
 */
export async function evaluateReadOnlyGuard(
  method: string,
  nextPath: string,
  req: NextRequest,
  resolveActor: (r: NextRequest) => Promise<AuthenticatedEmployee | null> = getAuthenticatedEmployee
): Promise<Response | null> {
  const upperMethod = method.toUpperCase();
  if (!MUTATING_METHODS.has(upperMethod)) return null;

  const cleanPath = nextPath.split('?')[0];
  if (READ_ONLY_AUTH_ALLOWLIST.has(cleanPath)) return null;

  const cookieHeader = req.headers.get('cookie') || '';
  const authHeader = req.headers.get('authorization') || '';
  if (!cookieHeader.includes('bems_session=') && !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const actor = await resolveActor(req).catch(() => null);
  if (actor && isReadOnlyEmployee(actor)) {
    return NextResponse.json(
      { error: 'Read-only compliance account: write operations are disabled.' },
      { status: 403 }
    );
  }
  return null;
}

export async function evaluateStaffModuleGuard(
  path: string,
  request: NextRequest,
  resolveActor: (request: NextRequest) => Promise<AuthenticatedEmployee | null> = getAuthenticatedEmployee
): Promise<Response | null> {
  const module = staffModuleForApiPath(path);
  if (!module) return null;
  const actor = await resolveActor(request);
  if (actor && !hasStaffAppModuleAccess(actor, module)) {
    return NextResponse.json({ error: 'This module is not assigned to your Staff App account.', code: 'STAFF_MODULE_DISABLED' }, { status: 403 });
  }
  return null;
}

/**
 * Converts a Next.js App Router path (e.g. `/api/budgets/[id]`)
 * into a Fastify route pattern (`/api/budgets/:id`).
 */
export function toFastifyRoutePath(nextPath: string): string {
  return nextPath
    .replace(/\[\[\.\.\.([^\]]+)\]\]/g, '*')
    .replace(/\[\.\.\.([^\]]+)\]/g, '*')
    .replace(/\[([^\]]+)\]/g, ':$1');
}

function buildNextRequest(req: FastifyRequest): NextRequest {
  const protoHeader = req.headers['x-forwarded-proto'];
  const rawProto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || req.protocol || 'https';
  const proto = String(rawProto).split(',')[0].trim() || 'https';
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const rawHost = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const host = String(rawHost).split(',')[0].trim() || 'localhost';
  const fullUrl = `${proto}://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, String(value));
    }
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  let body: BodyInit | undefined;

  if (hasBody && req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      body = req.body.length > 0 ? new Uint8Array(req.body) : undefined;
    } else if (typeof req.body === 'string') {
      body = req.body;
    } else {
      body = JSON.stringify(req.body);
    }
  }

  return new NextRequest(fullUrl, {
    method,
    headers,
    body,
  });
}

async function sendWebResponse(reply: FastifyReply, res: Response): Promise<void> {
  reply.code(res.status);

  const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : [];
  if (setCookies.length > 0) {
    reply.header('set-cookie', setCookies);
  }

  res.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie' || lower === 'content-length' || lower === 'transfer-encoding') {
      return;
    }
    reply.header(key, value);
  });

  if (!res.body) {
    await reply.send();
    return;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    const nodeStream = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
    await reply.send(nodeStream);
    return;
  }

  const arrayBuf = await res.arrayBuffer();
  await reply.send(Buffer.from(arrayBuf));
}

/**
 * Registers a single Next.js App Router module (`route.ts`) onto a Fastify instance.
 */
export function mountNextRoute(
  app: FastifyInstance,
  nextPath: string,
  routeModule: NextRouteModule
): void {
  const fastifyPath = toFastifyRoutePath(nextPath);

  for (const method of HTTP_METHODS) {
    const handler = routeModule[method];
    if (typeof handler !== 'function') continue;

    app.route({
      method,
      url: fastifyPath,
      handler: async (req: FastifyRequest, reply: FastifyReply) => {
        const nextReq = buildNextRequest(req);
        const blockedRes = await evaluateStaffModuleGuard(nextPath, nextReq) ?? await evaluateReadOnlyGuard(method, nextPath, nextReq);
        if (blockedRes) {
          await sendWebResponse(reply, blockedRes);
          return;
        }

        const cleanPath = req.url.split('?')[0];
        const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
        const forceFresh = queryString.includes('fresh=1') || (nextReq.headers.get('cache-control') || '').toLowerCase().includes('no-cache');
        const cachePolicy = method === 'GET' && !forceFresh ? resolveGetCachePolicy(cleanPath) : null;
        let cacheKey: string | null = null;

        if (cachePolicy) {
          cacheKey = buildApiCacheKey(
            cachePolicy.domain,
            req.url,
            nextReq.headers.get('cookie') || '',
            nextReq.headers.get('authorization') || '',
            nextReq.headers.get('x-employee-id') || ''
          );
          const cached = await getDistributedCache<{ body: string; contentType: string }>(cacheKey);
          if (cached && typeof cached.body === 'string') {
            reply
              .code(200)
              .header('content-type', cached.contentType || 'application/json; charset=utf-8')
              .header('x-bems-cache', 'HIT')
              .header('x-bems-cache-domain', cachePolicy.domain);
            await reply.send(Buffer.from(cached.body, 'utf8'));
            return;
          }
        }

        const rawParams = (req.params as Record<string, string>) || {};
        const params: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawParams)) {
          if (v !== undefined) params[k] = String(v);
        }

        const webRes = await handler(nextReq, {
          params: Promise.resolve(params),
        });

        // Auto-invalidate affected Redis cache domains after any successful write
        if (MUTATING_METHODS.has(method) && webRes.status >= 200 && webRes.status < 300) {
          const prefixes = resolveInvalidationPrefixes(cleanPath);
          if (prefixes.length > 0) {
            await Promise.all(prefixes.map((p) => invalidateDistributedCache(p)));
          }
        }

        // Store clean 200 JSON responses in Redis for allowlisted GET routes
        if (cachePolicy && cacheKey && webRes.status === 200) {
          const contentType = webRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const arrayBuf = await webRes.arrayBuffer();
            const bodyStr = Buffer.from(arrayBuf).toString('utf8');
            await setDistributedCache(cacheKey, { body: bodyStr, contentType }, cachePolicy.ttlMs);

            reply.code(200);
            webRes.headers.forEach((value, key) => {
              const lower = key.toLowerCase();
              if (lower === 'set-cookie' || lower === 'content-length' || lower === 'transfer-encoding') return;
              reply.header(key, value);
            });
            reply.header('x-bems-cache', 'MISS');
            reply.header('x-bems-cache-domain', cachePolicy.domain);
            await reply.send(Buffer.from(arrayBuf));
            return;
          }
        }

        if (method === 'GET') {
          reply.header('x-bems-cache', 'BYPASS');
        }
        await sendWebResponse(reply, webRes);
      },
    });
  }
}

/**
 * Registers a Fastify encapsulated plugin that parses all request bodies as raw `Buffer`
 * (preserving JSON, multipart uploads, and webhook HMAC signatures) and mounts all routes.
 */
export async function registerNextApiPlugin(
  app: FastifyInstance,
  registerRoutes: (scopedApp: FastifyInstance) => void
): Promise<void> {
  await app.register(async (scoped) => {
    scoped.removeAllContentTypeParsers();
    scoped.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: 25 * 1024 * 1024 },
      (_req, payload, done) => {
        done(null, payload);
      }
    );

    registerRoutes(scoped);
  });
}
