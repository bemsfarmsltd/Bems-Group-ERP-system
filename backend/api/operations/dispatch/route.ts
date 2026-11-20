import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  logOpsAudit,
  requireCustomAdminOpsAction,
  resolveOperationsContext,
} from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('organizationId') || '';

    const where: Record<string, any> = orgId
      ? { organizationId: orgId }
      : ctx.useSubFilter
        ? { organizationId: { in: ctx.allowedSubIds } }
        : {};

    if (ctx.isStaff) {
      where.assigneeId = ctx.actor.id;
    }

    const dispatches = await prisma.opsDispatchAssignment.findMany({
      where,
      orderBy: [{ plannedDate: 'asc' }, { createdAt: 'desc' }],
      take: 150,
      include: {
        workOrder: {
          select: { id: true, workOrderNumber: true, title: true, priority: true, status: true },
        },
        site: { select: { id: true, code: true, name: true } },
      },
    });

    const empIds = Array.from(
      new Set(dispatches.flatMap((d) => [d.assigneeId, d.dispatcherId]).filter(Boolean))
    );
    const emps = empIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: empIds } },
          select: { id: true, legalName: true, employeeNumber: true },
        })
      : [];
    const empMap = new Map(emps.map((e) => [e.id, e]));

    return NextResponse.json({
      dispatches: dispatches.map((d) => ({
        ...d,
        assigneeName: empMap.get(d.assigneeId)?.legalName || 'Unknown',
        dispatcherName: empMap.get(d.dispatcherId)?.legalName || 'Dispatcher',
      })),
    });
  } catch (error) {
    console.error('Operations dispatch GET error:', error);
    return NextResponse.json({ error: 'Could not load dispatch board.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_work_orders', 'assign_dispatch');
    if (denied) return denied;

    const body = await request.json();
    const workOrderId = String(body?.workOrderId || '').trim();
    const assigneeId = String(body?.assigneeId || '').trim();
    if (!workOrderId || !assigneeId) {
      return NextResponse.json({ error: 'workOrderId and assigneeId are required.' }, { status: 400 });
    }

    const wo = await prisma.opsWorkOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(wo.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const dispatch = await prisma.opsDispatchAssignment.create({
      data: {
        workOrderId: wo.id,
        organizationId: wo.organizationId,
        siteId: body?.siteId || wo.siteId || null,
        assigneeId,
        dispatcherId: ctx.actor.id,
        plannedDate: body?.plannedDate ? new Date(body.plannedDate) : new Date(),
        windowStart: body?.windowStart ? String(body.windowStart) : null,
        windowEnd: body?.windowEnd ? String(body.windowEnd) : null,
        dispatchStatus: 'ASSIGNED',
        notes: body?.notes ? String(body.notes).trim() : null,
      },
    });

    await prisma.opsWorkOrder.update({
      where: { id: wo.id },
      data: {
        assigneeId,
        status: wo.status === 'NEW' || wo.status === 'TRIAGED' ? 'SCHEDULED' : wo.status,
      },
    });

    await prisma.opsWorkLog.create({
      data: {
        workOrderId: wo.id,
        actorId: ctx.actor.id,
        entryType: 'DISPATCH',
        message: `Dispatched to assignee for ${dispatch.plannedDate.toISOString().slice(0, 10)}.`,
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_DISPATCH_CREATED',
      targetType: 'OPS_DISPATCH',
      targetId: dispatch.id,
      subsidiaryId: wo.organizationId,
      metadata: { workOrderId: wo.id, assigneeId },
    });

    void import('@/lib/notifications/policy-matrix').then(m => m.dispatchMatrixNotifications({
      eventKey: 'OPS_DISPATCH_WORK_ORDER',
      title: `Work Order Dispatched: ${wo.title || wo.id}`,
      body: `Assigned by ${ctx.actor.legalName} for ${dispatch.plannedDate.toISOString().slice(0, 10)}.`,
      category: 'GENERAL',
      priority: 'IMPORTANT',
      actionLabel: 'Open Operations',
      actionUrl: '/operations',
      targetEmployeeId: assigneeId,
    })).catch(() => {});

    return NextResponse.json({ dispatch }, { status: 201 });
  } catch (error) {
    console.error('Operations dispatch POST error:', error);
    return NextResponse.json({ error: 'Could not schedule dispatch.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'Dispatch id is required.' }, { status: 400 });

    const existing = await prisma.opsDispatchAssignment.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Dispatch record not found.' }, { status: 404 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    if (ctx.isStaff && existing.assigneeId !== ctx.actor.id) {
      return NextResponse.json({ error: 'Forbidden: Only assigned staff can update dispatch status.' }, { status: 403 });
    }

    const nextAssigneeId = !ctx.isStaff && body?.assigneeId ? String(body.assigneeId) : existing.assigneeId;
    const isReassignment = nextAssigneeId !== existing.assigneeId;
    const reassignReason = typeof body?.reassignReason === 'string' ? body.reassignReason.trim() : '';

    if (isReassignment) {
      const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_work_orders', 'assign_dispatch');
      if (denied) return denied;
      if (!reassignReason) {
        return NextResponse.json({ error: 'reassignReason is required when reassigning a dispatch.' }, { status: 400 });
      }
    }

    const updated = await prisma.opsDispatchAssignment.update({
      where: { id },
      data: {
        dispatchStatus: body?.dispatchStatus ? String(body.dispatchStatus).toUpperCase() : existing.dispatchStatus,
        assigneeId: nextAssigneeId,
        reassignedFromId: isReassignment ? existing.assigneeId : existing.reassignedFromId,
        reassignReason: isReassignment ? reassignReason : existing.reassignReason,
        notes: body?.notes !== undefined ? (body.notes ? String(body.notes).trim() : null) : existing.notes,
      },
    });

    if (isReassignment) {
      await prisma.opsWorkOrder.update({
        where: { id: existing.workOrderId },
        data: { assigneeId: nextAssigneeId },
      });
      await prisma.opsWorkLog.create({
        data: {
          workOrderId: existing.workOrderId,
          actorId: ctx.actor.id,
          entryType: 'DISPATCH',
          message: `Reassigned dispatch (${reassignReason}).`,
        },
      });
    }

    return NextResponse.json({ dispatch: updated });
  } catch (error) {
    console.error('Operations dispatch PATCH error:', error);
    return NextResponse.json({ error: 'Could not update dispatch.' }, { status: 500 });
  }
}
