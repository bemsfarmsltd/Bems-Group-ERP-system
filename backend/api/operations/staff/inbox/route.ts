import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveOperationsContext } from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const orgWhere = ctx.useSubFilter && ctx.allowedSubIds.length > 0
      ? { organizationId: { in: ctx.allowedSubIds } }
      : {};

    const [workOrders, dispatches, sites, services, sops, assets, handovers, incidents] = await Promise.all([
      prisma.opsWorkOrder.findMany({
        where: {
          ...orgWhere,
          OR: [{ assigneeId: ctx.actor.id }, { requesterId: ctx.actor.id }],
        },
        orderBy: [{ createdAt: 'desc' }],
        take: 60,
        include: {
          site: { select: { id: true, code: true, name: true, stateRegion: true } },
          service: { select: { id: true, code: true, name: true, category: true } },
        },
      }),
      prisma.opsDispatchAssignment.findMany({
        where: {
          ...orgWhere,
          assigneeId: ctx.actor.id,
        },
        orderBy: [{ plannedDate: 'asc' }],
        take: 40,
        include: {
          workOrder: { select: { id: true, workOrderNumber: true, title: true, status: true, priority: true } },
          site: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.opsSite.findMany({
        where: { ...orgWhere, status: 'ACTIVE' },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true, siteType: true, organizationId: true },
      }),
      prisma.opsServiceDefinition.findMany({
        where: { ...orgWhere, status: 'ACTIVE' },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true, category: true, organizationId: true },
      }),
      prisma.opsSopDocument.findMany({
        where: { ...orgWhere, status: 'ACTIVE' },
        orderBy: { title: 'asc' },
        take: 40,
      }),
      prisma.opsAsset.findMany({
        where: { ...orgWhere, custodianId: ctx.actor.id },
        orderBy: { name: 'asc' },
        take: 40,
      }),
      prisma.opsShiftHandover.findMany({
        where: {
          ...orgWhere,
          OR: [{ outgoingOfficerId: ctx.actor.id }, { incomingOfficerId: ctx.actor.id }],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.opsIncident.findMany({
        where: { ...orgWhere, reporterId: ctx.actor.id },
        orderBy: { reportedAt: 'desc' },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      workOrders,
      dispatches,
      sites,
      services,
      sops,
      assets,
      handovers,
      incidents,
    });
  } catch (error) {
    console.error('Operations staff inbox error:', error);
    return NextResponse.json({ error: 'Could not load Staff Operations inbox.' }, { status: 500 });
  }
}
