import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { prisma } from '../src/lib/prisma';
import { initTelemetry, logger, captureServerError } from '../src/lib/logger';
import { ApiValidationError, IdCardVerifyBodySchema, parseWithSchema } from '../src/lib/validation/http';
import { verifyIdCardToken } from '../src/lib/id-card-crypto';
import { clampIdCardLevel, ID_CARD_LEVELS, resolveDefaultCardLevel } from '../src/lib/id-card-levels';
import { subscribeRealtimeChannel } from '../src/lib/realtime';
import { registerNextApiPlugin } from './next-route-adapter';
import { registerAllNextApiRoutes } from './routes/register-api-routes';
import { registerSsrAndFileRoutes } from './routes/ssr-bootstrap';

initTelemetry('bems-erp-fastify-backend');
logger.info('Step 1: BEMS ERP backend module loaded');

const RAW_PORT = process.env.PORT || process.env.BACKEND_PORT || '4000';
const IS_NUMERIC_PORT = /^\d+$/.test(RAW_PORT);
const PORT = IS_NUMERIC_PORT ? Number(RAW_PORT) : 4000;
const HOST = process.env.BACKEND_HOST || '127.0.0.1';

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export async function buildBackendServer() {
  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  const allowedOrigins = parseAllowedOrigins();

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        cb(null, true);
        return;
      }
      cb(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  await app.register(cookie);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiValidationError) {
      return reply.status(400).send({ error: err.message, issues: err.issues });
    }
    captureServerError(err, { method: req.method, url: req.url });
    return reply.status(500).send({ error: 'Internal server error' });
  });

  app.get('/health', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({
        ok: true,
        service: 'bems-erp-backend',
        database: 'connected',
        redisConfigured: Boolean(process.env.REDIS_URL),
        objectStorageConfigured: Boolean(process.env.S3_BUCKET || process.env.R2_BUCKET),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      captureServerError(err, { route: '/health' });
      return reply.status(503).send({ ok: false, service: 'bems-erp-backend', database: 'disconnected' });
    }
  });

  app.get('/api/v1/meta/architecture', async () => ({
    architecture: 'decoupled-frontend-backend',
    backend: 'fastify',
    corsAllowedOrigins: allowedOrigins,
    features: {
      zodValidation: true,
      pinoTelemetry: true,
      sentryConfigured: Boolean(process.env.SENTRY_DSN),
      redisConfigured: Boolean(process.env.REDIS_URL),
      objectStorageConfigured: Boolean(process.env.S3_BUCKET || process.env.R2_BUCKET),
    },
  }));

  app.get('/api/v1/realtime/stream', async (req, reply) => {
    const query = req.query as { channel?: string };
    const channel = String(query?.channel || 'global').trim() || 'global';

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true',
    });

    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ channel, ts: new Date().toISOString() })}\n\n`);

    const unsubscribe = subscribeRealtimeChannel(channel, (evt) => {
      reply.raw.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(`: keepalive\n\n`);
    }, 25_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    return reply;
  });

  app.post('/api/v1/hr/id-cards/verify', async (req, reply) => {
    const body = parseWithSchema(IdCardVerifyBodySchema, req.body);
    let employeeId = '';
    let tokenLevel: number | null = null;

    if (body.token) {
      const check = verifyIdCardToken(body.token);
      if (!check.valid) {
        return reply.status(401).send({ verified: false, reason: check.reason });
      }
      employeeId = check.payload.eid;
      tokenLevel = check.payload.lvl;
    }

    if (!employeeId && body.code) {
      const empByNum = await prisma.employee.findFirst({
        where: { employeeNumber: { equals: body.code.replace(/^.*-ID-/, ''), mode: 'insensitive' } },
        select: { id: true },
      });
      if (empByNum) employeeId = empByNum.id;
    }

    if (!employeeId) {
      return reply.status(404).send({ verified: false, reason: 'Credential record not found.' });
    }

    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        employeeNumber: true,
        legalName: true,
        role: true,
        jobTitle: true,
        staffGrade: true,
        employmentType: true,
        status: true,
        approvalStatus: true,
        customAdminProfileId: true,
        customAdminTitle: true,
        assignments: {
          where: { status: 'ACTIVE' },
          orderBy: [{ isPrimary: 'desc' }, { startsOn: 'desc' }],
          take: 1,
          include: {
            department: { select: { name: true } },
            subsidiary: { select: { legalName: true, code: true } },
          },
        },
      },
    });

    if (!emp || emp.status !== 'ACTIVE' || emp.approvalStatus !== 'APPROVED') {
      return reply.status(403).send({ verified: false, reason: 'Employee account is inactive or unapproved.' });
    }

    const primary = emp.assignments?.[0];
    const liveLevel = clampIdCardLevel(
      tokenLevel ??
        resolveDefaultCardLevel({
          role: emp.role,
          staffGrade: emp.staffGrade,
          jobTitle: emp.jobTitle,
          departmentName: primary?.department?.name,
          employmentType: emp.employmentType,
          customAdminProfileId: emp.customAdminProfileId,
          customAdminTitle: emp.customAdminTitle,
        })
    );
    const spec = ID_CARD_LEVELS[liveLevel];
    const clearanceGranted = !body.requiredMinLevel || liveLevel >= body.requiredMinLevel;

    return reply.status(clearanceGranted ? 200 : 403).send({
      verified: true,
      clearanceGranted,
      cardLevel: liveLevel,
      levelCode: spec.code,
      levelName: spec.name,
      employee: {
        id: emp.id,
        employeeNumber: emp.employeeNumber,
        legalName: emp.legalName,
        role: emp.role,
        departmentName: primary?.department?.name || 'Operations',
        subsidiaryName: primary?.subsidiary?.legalName || 'BEMS Group',
      },
    });
  });

  logger.info('Step 2: registering Next API routes onto Fastify');
  await registerNextApiPlugin(app, registerAllNextApiRoutes);
  registerSsrAndFileRoutes(app);
  logger.info('Step 3: all Next API routes registered');

  return app;
}

if (!process.env.VITEST) {
  buildBackendServer()
    .then(async (app) => {
      const address = IS_NUMERIC_PORT
        ? await app.listen({ port: PORT, host: HOST })
        : await app.listen({ path: RAW_PORT });
      logger.info({ rawPort: RAW_PORT, address }, `BEMS ERP standalone Fastify backend listening on ${address} (rawPort=${RAW_PORT})`);

      const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Shutting down backend server...');
        await app.close();
        await prisma.$disconnect();
        process.exit(0);
      };
      process.on('SIGINT', () => void shutdown('SIGINT'));
      process.on('SIGTERM', () => void shutdown('SIGTERM'));
    })
    .catch((err) => {
      captureServerError(err, { phase: 'startup' });
      process.exit(1);
    });
}
