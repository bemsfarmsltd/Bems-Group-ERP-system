import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { loadSsrPageData } from '../../src/lib/services/ssr-page-data';
import { mountNextRoute, type NextRouteModule } from '../next-route-adapter';
import * as downloadFileRoute from '../file-routes/download/[filename]/route';
import * as uploadsRoute from '../file-routes/uploads/[...path]/route';
import * as secureUploadsRoute from '../file-routes/secure-uploads/[...path]/route';

function buildCookieOnlyRequest(req: FastifyRequest): Request {
  const headers = new Headers();
  if (req.headers.cookie) headers.set('cookie', String(req.headers.cookie));
  if (req.headers.authorization) headers.set('authorization', String(req.headers.authorization));
  return new Request('http://localhost/api/v1/ssr/page-data', { headers });
}

export function registerSsrAndFileRoutes(app: FastifyInstance): void {
  mountNextRoute(app, '/download/[filename]', downloadFileRoute as unknown as NextRouteModule);
  mountNextRoute(app, '/uploads/[...path]', uploadsRoute as unknown as NextRouteModule);
  mountNextRoute(app, '/secure-uploads/[...path]', secureUploadsRoute as unknown as NextRouteModule);

  app.get('/api/v1/ssr/page-data', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { page?: string; requestNumber?: string };
    const page = String(query?.page || '').trim();
    const result = await loadSsrPageData(buildCookieOnlyRequest(req), page, query?.requestNumber);
    return reply.status(result.status).send(result.body);
  });
}
