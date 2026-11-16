import pino from 'pino';
import * as Sentry from '@sentry/node';

let sentryInitialized = false;

export function initTelemetry(serviceName = 'bems-erp-api') {
  if (sentryInitialized) return;
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.npm_package_version || '0.1.0',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.15 : 1.0,
      initialScope: { tags: { service: serviceName } },
    });
  }
  sentryInitialized = true;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: { service: process.env.SERVICE_NAME || 'bems-erp' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash', '*.token'],
    censor: '[REDACTED]',
  },
});

export function captureServerError(err: unknown, context?: Record<string, unknown>) {
  logger.error({ err, ...context }, err instanceof Error ? err.message : 'Unhandled server error');
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    initTelemetry();
    Sentry.withScope((scope) => {
      if (context) {
        Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      }
      Sentry.captureException(err);
    });
  }
}
