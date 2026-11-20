import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole, hasEmployeePermission } from '@/lib/auth';
import { invalidateServerCache } from '@/lib/server-cache';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_EVENT_CATALOG,
  buildDefaultMatrix,
  dispatchMatrixNotifications,
  getNotificationPolicyMatrix,
  saveNotificationPolicyMatrix,
} from '@/lib/notifications/policy-matrix';

export const dynamic = 'force-dynamic';

const EXEC_ROLES = ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'];

export async function GET(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    const canRead =
      actor &&
      (hasAnyRole(actor, EXEC_ROLES) ||
        (hasAnyRole(actor, ['CUSTOM_ADMIN']) && hasEmployeePermission(actor, 'control-center')));
    if (!canRead) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const customProfiles = await prisma.customAdminProfile.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { employees: true } },
      },
    });

    const matrix = await getNotificationPolicyMatrix(
      prisma,
      customProfiles.map((p) => p.id)
    );

    return NextResponse.json({
      success: true,
      categories: NOTIFICATION_CATEGORIES,
      events: NOTIFICATION_EVENT_CATALOG,
      customProfiles: customProfiles.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        memberCount: p._count.employees,
      })),
      matrix,
    });
  } catch (error) {
    console.error('GET /api/control-center/notification-matrix error:', error);
    return NextResponse.json(
      { error: 'Failed to load notification configuration matrix.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, EXEC_ROLES)) {
      return NextResponse.json(
        { error: 'Only GMD or Super Admin can update enterprise notification policies.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'SAVE_MATRIX').toUpperCase();

    if (action === 'TEST_DISPATCH') {
      const eventKey = String(body.eventKey || 'REQUEST_SUBMITTED');
      const evt = NOTIFICATION_EVENT_CATALOG.find((e) => e.key === eventKey) || NOTIFICATION_EVENT_CATALOG[0];
      const delivery = await dispatchMatrixNotifications({
        eventKey: evt.key,
        title: `Test Alert: ${evt.label}`,
        body: `Live verification triggered by ${actor.legalName} from Control Center Notification Matrix.`,
        category: 'SECURITY',
        priority: 'IMPORTANT',
        actionLabel: 'Open Control Center',
        actionUrl: '/control-center?section=notifications',
        targetEmployeeId: actor.id,
      });
      return NextResponse.json({ success: true, delivery });
    }

    if (action === 'RESET_DEFAULTS') {
      const profiles = await prisma.customAdminProfile.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      const defaults = buildDefaultMatrix(profiles.map((p) => p.id));
      const saved = await saveNotificationPolicyMatrix(actor, defaults);
      invalidateServerCache('control-center:');
      return NextResponse.json({ success: true, matrix: saved });
    }

    if (!body.matrix || typeof body.matrix !== 'object') {
      return NextResponse.json({ error: 'Notification matrix payload is required.' }, { status: 400 });
    }

    const saved = await saveNotificationPolicyMatrix(actor, body.matrix);
    invalidateServerCache('control-center:');
    return NextResponse.json({ success: true, matrix: saved });
  } catch (error) {
    console.error('POST /api/control-center/notification-matrix error:', error);
    return NextResponse.json(
      { error: 'Failed to save notification configuration matrix.' },
      { status: 500 }
    );
  }
}
