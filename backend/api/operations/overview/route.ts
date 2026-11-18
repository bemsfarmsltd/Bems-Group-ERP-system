import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveOperationsContext } from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('organizationId') || '';
    const siteId = searchParams.get('siteId') || '';
    const serviceId = searchParams.get('serviceId') || '';
    const status = searchParams.get('status') || '';
    const priority = searchParams.get('priority') || '';

    const orgWhere = orgId
      ? { organizationId: orgId }
      : ctx.useSubFilter
        ? { organizationId: { in: ctx.allowedSubIds } }
        : {};

    const woWhere: Record<string, any> = { ...orgWhere };
    if (siteId) woWhere.siteId = siteId;
    if (serviceId) woWhere.serviceId = serviceId;
    if (status) woWhere.status = status;
    if (priority) woWhere.priority = priority;

    const now = new Date();

    const [
      workOrders,
      sites,
      services,
      pendingApprovalsCount,
      todayDispatchesCount,
      recentLogs,
      subsidiaries,
      employees,
    ] = await Promise.all([
      prisma.opsWorkOrder.findMany({
        where: woWhere,
        orderBy: [{ createdAt: 'desc' }],
        take: 100,
        include: {
          site: { select: { id: true, code: true, name: true, stateRegion: true } },
          service: { select: { id: true, code: true, name: true, category: true, slaResolveHours: true } },
        },
      }),
      prisma.opsSite.findMany({
        where: { ...orgWhere, status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      }),
      prisma.opsServiceDefinition.findMany({
        where: { ...orgWhere, status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      }),
      prisma.opsApprovalDecision.count({
        where: { ...orgWhere, decision: 'PENDING' },
      }),
      prisma.opsDispatchAssignment.count({
        where: {
          ...orgWhere,
          plannedDate: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          },
        },
      }),
      prisma.opsWorkLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: {
          workOrder: {
            select: { id: true, workOrderNumber: true, title: true, organizationId: true, priority: true },
          },
        },
      }),
      prisma.organization.findMany({
        where: ctx.useSubFilter ? { id: { in: ctx.allowedSubIds } } : { status: 'ACTIVE' },
        orderBy: { legalName: 'asc' },
        select: { id: true, legalName: true, code: true, type: true },
      }),
      prisma.employee.findMany({
        where: { status: 'ACTIVE', approvalStatus: 'APPROVED' },
        orderBy: { legalName: 'asc' },
        select: { id: true, legalName: true, employeeNumber: true, jobTitle: true, role: true },
      }),
    ]);

    const empMap = new Map(employees.map((e) => [e.id, e]));
    const orgMap = new Map(subsidiaries.map((o) => [o.id, o]));

    const openStatuses = new Set(['NEW', 'TRIAGED', 'ASSIGNED', 'SCHEDULED', 'AWAITING_INPUT', 'REVIEW']);
    const openCount = workOrders.filter((w) => openStatuses.has(w.status)).length;
    const inProgressCount = workOrders.filter((w) => w.status === 'IN_PROGRESS').length;
    const blockedCount = workOrders.filter((w) => w.status === 'BLOCKED').length;
    const completedCount = workOrders.filter((w) => w.status === 'COMPLETED' || w.status === 'CLOSED').length;
    const overdueCount = workOrders.filter(
      (w) => w.dueAt && new Date(w.dueAt) < now && !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(w.status)
    ).length;

    const scopedLogs = recentLogs
      .filter((log) => !ctx.useSubFilter || ctx.allowedSubIds.includes(log.workOrder.organizationId))
      .map((log) => ({
        id: log.id,
        workOrderId: log.workOrderId,
        workOrderNumber: log.workOrder.workOrderNumber,
        workOrderTitle: log.workOrder.title,
        priority: log.workOrder.priority,
        entryType: log.entryType,
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        message: log.message,
        actorName: empMap.get(log.actorId)?.legalName || 'System',
        createdAt: log.createdAt.toISOString(),
      }));

    return NextResponse.json({
      lastUpdatedAt: now.toISOString(),
      kpis: {
        totalWorkOrders: workOrders.length,
        openCount,
        inProgressCount,
        blockedCount,
        completedCount,
        overdueCount,
        activeSitesCount: sites.length,
        activeServicesCount: services.length,
        pendingApprovalsCount,
        todayDispatchesCount,
      },
      workOrders: workOrders.map((w) => ({
        ...w,
        organizationName: orgMap.get(w.organizationId)?.legalName || 'BEMS Group',
        requesterName: empMap.get(w.requesterId)?.legalName || 'Unknown',
        assigneeName: w.assigneeId ? empMap.get(w.assigneeId)?.legalName || null : null,
        supervisorName: w.supervisorId ? empMap.get(w.supervisorId)?.legalName || null : null,
      })),
      sites,
      services,
      recentFeed: scopedLogs,
      subsidiaries,
      staffOptions: employees,
    });
  } catch (error) {
    console.error('Operations overview error:', error);
    return NextResponse.json({ error: 'Could not load Operations Command Centre.' }, { status: 500 });
  }
}
