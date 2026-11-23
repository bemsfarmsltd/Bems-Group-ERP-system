import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee, getHrAuthorizationScope, hasAnyRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { executeDashboardCommand } from '@/lib/staged-actions';
import { getLagosTime } from '@/lib/attendance/token';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const actor = await getAuthenticatedEmployee(request);
  if (!actor) return NextResponse.json({ error: 'Sign in to view stations.' }, { status: 401 });
  const scope = await getHrAuthorizationScope(actor);
  if (!hasAnyRole(actor, ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN']) && !scope.authorized) {
    return NextResponse.json({ error: 'Administrative access required.' }, { status: 403 });
  }
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId');
  const includeInactive = url.searchParams.get('includeInactive') === 'true';
  const { workDate } = getLagosTime(new Date());

  const stations = await prisma.attendanceStation.findMany({
    where: {
      ...(includeInactive ? {} : { status: 'ACTIVE' }),
      ...(scope.isGlobal ? {} : { organizationId: { in: scope.subsidiaryIds } }),
      ...(organizationId ? { AND: [{ organizationId }] } : {}),
    },
    include: {
      organization: { select: { id: true, legalName: true, code: true } },
      _count: {
        select: {
          records: {
            where: { workDate },
          },
        },
      },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });

  const formattedStations = stations.map((s) => ({
    ...s,
    todayCheckIns: s._count?.records ?? 0,
  }));

  return NextResponse.json({
    station: formattedStations[0] || null,
    stations: formattedStations,
    requiresSelection: formattedStations.length > 1,
  });
}

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) return NextResponse.json({ error: 'Sign in to calibrate a station.' }, { status: 401 });
    const body = await request.json();
    const scope = await getHrAuthorizationScope(actor);
    const isCreate = String(body.mode || '').toUpperCase() === 'CREATE';
    let organizationId = body.organizationId;
    let stationId = isCreate ? undefined : body.stationId || body.id;

    if (!organizationId && stationId) {
      const existing = await prisma.attendanceStation.findUnique({
        where: { id: String(stationId) },
        select: { organizationId: true },
      });
      if (existing) organizationId = existing.organizationId;
    }

    if (!organizationId) {
      const stations = await prisma.attendanceStation.findMany({
        where: {
          status: 'ACTIVE',
          ...(scope.isGlobal ? {} : { organizationId: { in: scope.subsidiaryIds } }),
        },
        orderBy: { createdAt: 'asc' },
        take: 2,
      });
      if (stations.length >= 1) {
        organizationId = stations[0].organizationId;
        if (!isCreate && !stationId && stations.length === 1) {
          stationId = stations[0].id;
        }
      } else {
        const groups = await prisma.organization.findMany({
          where: { type: 'GROUP', status: 'ACTIVE' },
          take: 2,
        });
        if (groups.length >= 1) organizationId = groups[0].id;
      }
    }

    const station = await executeDashboardCommand(actor, 'attendance_override', {
      action_type: 'CALIBRATE_STATION',
      mode: isCreate ? 'CREATE' : 'UPDATE',
      organizationId,
      stationId,
      name: body.name,
      code: body.code,
      stateLocation: body.stateLocation,
      latitude: body.latitude,
      longitude: body.longitude,
      radiusMeters: body.radiusMeters,
      starlinkOverrideMode: body.starlinkOverrideMode,
      starlinkIpAddresses: body.starlinkIpAddresses,
      requireGeofenceOverride: body.requireGeofenceOverride,
      status: body.status,
    });

    const allStations = await prisma.attendanceStation.findMany({
      where: {
        status: 'ACTIVE',
        ...(scope.isGlobal ? {} : { organizationId: { in: scope.subsidiaryIds } }),
      },
      include: { organization: { select: { id: true, legalName: true, code: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      station,
      stations: allStations,
      message: isCreate
        ? `New Kiosk Location "${(station as any)?.name || body.name}" created and mapped!`
        : `Kiosk Location "${(station as any)?.name || body.name}" saved and calibrated!`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    if (!hasAnyRole(actor, ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Executive access required to remove a kiosk station.' }, { status: 403 });
    }
    const url = new URL(request.url);
    const stationId = url.searchParams.get('stationId');
    if (!stationId) {
      return NextResponse.json({ error: 'stationId is required.' }, { status: 400 });
    }
    const activeCount = await prisma.attendanceStation.count({ where: { status: 'ACTIVE' } });
    if (activeCount <= 1) {
      return NextResponse.json(
        { error: 'At least one active Kiosk Station must remain configured in BEMS.' },
        { status: 400 }
      );
    }
    await prisma.attendanceStation.update({
      where: { id: stationId },
      data: { status: 'INACTIVE' },
    });
    const remaining = await prisma.attendanceStation.findMany({
      where: { status: 'ACTIVE' },
      include: { organization: { select: { id: true, legalName: true, code: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({
      success: true,
      stations: remaining,
      station: remaining[0] || null,
      message: 'Kiosk location deactivated.',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to deactivate station.' }, { status: 400 });
  }
}
