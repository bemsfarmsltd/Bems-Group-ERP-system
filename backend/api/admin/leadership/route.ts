import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor || !hasAnyRole(actor, ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Executive authorization required.' }, { status: 403 });
    }

    const leaders = await prisma.employee.findMany({
      where: {
        role: {
          in: ['GMD', 'SYSTEM_ADMIN', 'SUPER_ADMIN', 'CUSTOM_ADMIN'],
        },
        status: { notIn: ['DELETED', 'TERMINATED'] },
      },
      include: {
        assignments: {
          include: {
            subsidiary: { select: { id: true, legalName: true, code: true } },
            department: { select: { id: true, name: true } },
          },
          take: 1,
        },
      },
      orderBy: [{ role: 'asc' }, { legalName: 'asc' }],
    });

    const leaderIds = leaders.map((l) => l.id);
    const [sessions, latestAudits] = await Promise.all([
      prisma.authSession.findMany({
        where: { employeeId: { in: leaderIds } },
        select: { employeeId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditEvent.findMany({
        where: { actorId: { in: leaderIds } },
        select: { actorId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const lastLoginMap = new Map<string, Date>();
    for (const s of sessions) {
      if (!lastLoginMap.has(s.employeeId)) lastLoginMap.set(s.employeeId, s.createdAt);
    }
    const lastActiveMap = new Map<string, Date>();
    for (const a of latestAudits) {
      if (a.actorId && !lastActiveMap.has(a.actorId)) lastActiveMap.set(a.actorId, a.createdAt);
    }

    const safeLeaders = leaders.map((l) => ({
      id: l.id,
      legalName: l.legalName,
      employeeNumber: l.employeeNumber,
      workEmail: l.workEmail,
      phone: l.phone,
      role: l.role,
      status: l.status,
      subsidiaryName: l.assignments[0]?.subsidiary?.legalName || 'BEMS Group',
      departmentName: l.assignments[0]?.department?.name || 'Executive Directorate',
      positionName: l.jobTitle || l.role,
      isCurrentUser: l.id === actor.id || l.workEmail.toLowerCase() === actor.workEmail.toLowerCase(),
      createdAt: l.createdAt,
      lastLoginAt: lastLoginMap.get(l.id) ?? null,
      lastActiveAt: lastActiveMap.get(l.id) ?? lastLoginMap.get(l.id) ?? null,
    }));

    return NextResponse.json({ leaders: safeLeaders });
  } catch (error: any) {
    console.error('Error in GET /api/admin/leadership:', error);
    return NextResponse.json({ error: error.message || 'Failed to list leadership accounts.' }, { status: 500 });
  }
}
