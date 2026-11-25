import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole, verifyPassword } from '@/lib/auth';
import { KIOSK_COOKIE_NAME } from '@/lib/attendance/station-auth';
import {
  createKioskSession,
  getKioskPasswordMeta,
  parseDeviceLabel,
  verifyKioskPasswordHash,
} from '@/lib/attendance/kiosk-sessions';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rl = await checkRateLimit(`kiosk-activate:${clientIp}`, {
      maxAttempts: 12,
      windowMs: 10 * 60 * 1000,
      blockDurationMs: 15 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many kiosk unlock attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const actor = await getAuthenticatedEmployee(request, { disallowServiceToken: true }).catch(() => null);
    const isExecutive = actor ? hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN']) : false;

    const body = await request.json().catch(() => ({}));
    const kioskPassword = typeof body.kioskPassword === 'string' ? body.kioskPassword.trim() : '';
    const adminPassword = typeof body.adminPassword === 'string' ? body.adminPassword.trim() : '';
    const suppliedPass = kioskPassword || adminPassword;
    const bootstrapSecret = typeof body.bootstrapSecret === 'string' ? body.bootstrapSecret.trim() : '';

    const expectedBootstrap = (process.env.BEMS_BOOTSTRAP_SECRET || '').trim();
    let authorized = false;
    let activatedBy = 'Kiosk Password';

    // 1. Primary path: Dedicated Kiosk Access Password set in HR Admin
    if (suppliedPass) {
      const kioskPwMeta = await getKioskPasswordMeta();
      if (kioskPwMeta && verifyKioskPasswordHash(suppliedPass, kioskPwMeta)) {
        authorized = true;
        activatedBy = isExecutive && actor ? `${actor.legalName} (Kiosk Password)` : 'Kiosk Access Password';
      }
    }

    // 2. Fallback: Bootstrap secret
    if (!authorized && expectedBootstrap && bootstrapSecret === expectedBootstrap) {
      authorized = true;
      activatedBy = 'Bootstrap Secret';
    }

    // 3. Fallback: Executive password (only if no dedicated kiosk password has been set yet, or as admin override)
    if (!authorized && suppliedPass) {
      const admins = await prisma.employee.findMany({
        where: {
          role: { in: ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'] },
          status: 'ACTIVE',
        },
        select: { legalName: true, role: true, passwordHash: true },
        take: 10,
      });
      for (const admin of admins) {
        if (await verifyPassword(suppliedPass, admin.passwordHash)) {
          authorized = true;
          activatedBy = `${admin.legalName} (${admin.role})`;
          break;
        }
      }
    }

    if (!authorized) {
      return NextResponse.json(
        { error: 'Invalid Kiosk Access Password. Ask HR Admin for the current Kiosk Password.' },
        { status: 403 }
      );
    }

    const requestedCode = typeof body.stationCode === 'string' ? body.stationCode.trim() : '';
    const station = requestedCode
      ? await prisma.attendanceStation.findFirst({
          where: { status: 'ACTIVE', code: requestedCode },
          include: { organization: { select: { legalName: true } } },
        })
      : await prisma.attendanceStation.findFirst({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          include: { organization: { select: { legalName: true } } },
        });

    if (!station || !station.activeSecret) {
      return NextResponse.json({ error: 'No active attendance station found.' }, { status: 404 });
    }

    const deviceLabel =
      (typeof body.deviceLabel === 'string' && body.deviceLabel.trim()) ||
      parseDeviceLabel(request.headers.get('user-agent') || '');

    const session = await createKioskSession({
      stationCode: station.code,
      stationName: station.name,
      stateLocation: station.stateLocation,
      deviceLabel,
      ipAddress: clientIp,
      activatedBy,
    });

    const res = NextResponse.json({
      success: true,
      sessionId: session.id,
      stationCode: station.code,
      stationName: station.name,
      organizationName: station.organization.legalName,
    });

    const isProd = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || (isProd ? '.bemserp.work' : undefined);
    res.cookies.set(KIOSK_COOKIE_NAME, `ks:${session.id}`, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    return res;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Activation failed.' }, { status: 500 });
  }
}
