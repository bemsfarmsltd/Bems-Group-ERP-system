import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  generateWorkOrderNumber,
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
    const status = searchParams.get('status') || '';
    const siteId = searchParams.get('siteId') || '';
    const q = (searchParams.get('q') || '').trim();

    const where: Record<string, any> = orgId
      ? { organizationId: orgId }
      : ctx.useSubFilter
        ? { organizationId: { in: ctx.allowedSubIds } }
        : {};

    if (ctx.isStaff) {
      where.OR = [{ assigneeId: ctx.actor.id }, { requesterId: ctx.actor.id }];
    }
    if (status) where.status = status;
    if (siteId) where.siteId = siteId;
    if (q) {
      where.AND = [
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { workOrderNumber: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const workOrders = await prisma.opsWorkOrder.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 150,
      include: {
        site: { select: { id: true, code: true, name: true } },
        service: { select: { id: true, code: true, name: true, requiresVerification: true } },
      },
    });

    return NextResponse.json({ workOrders });
  } catch (error) {
    console.error('Operations work-orders GET error:', error);
    return NextResponse.json({ error: 'Could not load work orders.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    if (!ctx.isStaff) {
      const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_work_orders', 'create_work_orders');
      if (denied) return denied;
    }

    const body = await request.json();
    const title = String(body?.title || '').trim();
    if (!title) {
      return NextResponse.json({ error: 'Work order title is required.' }, { status: 400 });
    }

    let organizationId = String(body?.organizationId || '').trim();
    if (!organizationId) {
      if (ctx.allowedSubIds.length > 0) {
        organizationId = ctx.allowedSubIds[0];
      } else {
        const firstOrg = await prisma.organization.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } });
        organizationId = firstOrg?.id || '';
      }
    }
    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const serviceId = body?.serviceId ? String(body.serviceId) : null;
    const service = serviceId ? await prisma.opsServiceDefinition.findUnique({ where: { id: serviceId } }) : null;

    const workOrderNumber = await generateWorkOrderNumber();
    const dueAt = body?.dueAt
      ? new Date(body.dueAt)
      : service
        ? new Date(Date.now() + service.slaResolveHours * 3600 * 1000)
        : null;

    const initialAssigneeId = !ctx.isStaff && body?.assigneeId ? String(body.assigneeId) : null;
    const initialStatus = initialAssigneeId ? 'ASSIGNED' : 'NEW';

    const workOrder = await prisma.opsWorkOrder.create({
      data: {
        workOrderNumber,
        organizationId,
        siteId: body?.siteId || null,
        serviceId,
        departmentId: body?.departmentId || null,
        parentWorkOrderId: body?.parentWorkOrderId || null,
        sourceType: ctx.isStaff ? 'SERVICE_REQUEST' : String(body?.sourceType || 'INTERNAL').toUpperCase(),
        title,
        description: body?.description ? String(body.description).trim() : null,
        priority: String(body?.priority || 'MEDIUM').toUpperCase(),
        status: initialStatus,
        requesterId: ctx.actor.id,
        ownerId: body?.ownerId || ctx.actor.id,
        assigneeId: initialAssigneeId,
        supervisorId: body?.supervisorId || null,
        dueAt,
        checklistJson: Array.isArray(body?.checklist) ? JSON.stringify(body.checklist) : null,
        linkedRequestId: body?.linkedRequestId || null,
      },
      include: {
        site: { select: { id: true, code: true, name: true } },
        service: { select: { id: true, code: true, name: true } },
      },
    });

    await prisma.opsWorkLog.create({
      data: {
        workOrderId: workOrder.id,
        actorId: ctx.actor.id,
        entryType: 'STATE_CHANGE',
        fromStatus: null,
        toStatus: initialStatus,
        message: `Work order ${workOrder.workOrderNumber} created (${workOrder.sourceType}).`,
      },
    });

    if (service?.requiresApproval || Boolean(body?.requiresApproval)) {
      await prisma.opsApprovalDecision.create({
        data: {
          workOrderId: workOrder.id,
          organizationId: workOrder.organizationId,
          initiatorId: ctx.actor.id,
          decision: 'PENDING',
        },
      });
    }

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_WORK_ORDER_CREATED',
      targetType: 'OPS_WORK_ORDER',
      targetId: workOrder.id,
      subsidiaryId: workOrder.organizationId,
      metadata: { workOrderNumber: workOrder.workOrderNumber, priority: workOrder.priority },
    });

    return NextResponse.json({ workOrder }, { status: 201 });
  } catch (error) {
    console.error('Operations work-orders POST error:', error);
    return NextResponse.json({ error: 'Could not create work order.' }, { status: 500 });
  }
}
