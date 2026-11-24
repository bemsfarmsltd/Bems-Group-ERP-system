import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole, verifyPassword } from '@/lib/auth';
import { KIOSK_COOKIE_NAME } from '@/lib/attendance/station-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request, { disallowServiceToken: true }).catch(() => null);
    const isExecutive = actor ? hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN']) : false;

    const body = await request.json().catch(() => ({}));
    const bootstrapSecret = typeof body.bootstrapSecret === 'string' ? body.bootstrapSecret.trim() : '';
    const adminPassword = typeof body.adminPassword === 'string' ? body.adminPassword.trim() : '';

    const expectedBootstrap = (process.env.BEMS_BOOTSTRAP_SECRET || '').trim();
    let authorized = isExecutive;

    if (!authorized && expectedBootstrap && bootstrapSecret === expectedBootstrap) {
      authorized = true;
    }

    if (!authorized && adminPassword) {
      const admin = await prisma.employee.findFirst({
        where: {
          role: { in: ['GMD', 'SUPER_ADMIN'] },
          status: 'ACTIVE',
        },
      });
      if (admin && await verifyPassword(adminPassword, admin.passwordHash)) {
        authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Executive session, activation password, or kiosk key required.' }, { status: 403 });
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

    const res = NextResponse.json({
      success: true,
      stationCode: station.code,
      stationName: station.name,
      organizationName: station.organization.legalName,
    });

    const isProd = process.env.NODE_ENV === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || (isProd ? '.bemserp.work' : undefined);
    res.cookies.set(KIOSK_COOKIE_NAME, `${station.code}:${station.activeSecret}`, {
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

