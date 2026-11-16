import { describe, expect, it } from 'vitest';
import { toFastifyRoutePath } from '../backend/next-route-adapter';
import { buildBackendServer } from '../backend/server';
import { getSessionCookieOptions } from '../src/lib/auth';

describe('Next-to-Fastify Route Adapter & Mounted API Routes', () => {
  it('converts Next.js dynamic segments to Fastify route syntax', () => {
    expect(toFastifyRoutePath('/api/budgets/[id]')).toBe('/api/budgets/:id');
    expect(toFastifyRoutePath('/api/requests/[requestNumber]/action')).toBe('/api/requests/:requestNumber/action');
    expect(toFastifyRoutePath('/api/files/[...slug]')).toBe('/api/files/*');
    expect(toFastifyRoutePath('/api/docs/[[...slug]]')).toBe('/api/docs/*');
  });

  it('respects COOKIE_DOMAIN in getSessionCookieOptions', () => {
    const prev = process.env.COOKIE_DOMAIN;
    process.env.COOKIE_DOMAIN = '.bemserp.work';
    const opts = getSessionCookieOptions(new Date('2030-01-01T00:00:00Z'));
    expect(opts.domain).toBe('.bemserp.work');
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    if (prev === undefined) delete process.env.COOKIE_DOMAIN;
    else process.env.COOKIE_DOMAIN = prev;
  });

  it('mounts migrated Next.js API routes onto Fastify and parses JSON bodies', async () => {
    const app = await buildBackendServer();
    try {
      const loginBad = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ email: '', password: '' }),
      });
      expect(loginBad.statusCode).toBe(400);
      expect(loginBad.json()).toHaveProperty('error');

      const walletUnauth = await app.inject({
        method: 'GET',
        url: '/api/wallet/me',
      });
      expect(walletUnauth.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
