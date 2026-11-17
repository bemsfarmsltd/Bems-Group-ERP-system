import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { NextRequest } from 'next/server';

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
        const rawParams = (req.params as Record<string, string>) || {};
        const params: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawParams)) {
          if (v !== undefined) params[k] = String(v);
        }

        const webRes = await handler(nextReq, {
          params: Promise.resolve(params),
        });
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
