import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  isValidOpsTransition,
  logOpsAudit,
  requireCustomAdminOpsAction,
  resolveOperationsContext,
} from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const { id } = await context.params;
    const workOrder = await prisma.opsWorkOrder.findUnique({
      where: { id },
      include: {
        site: true,
        service: true,
        dispatches: { orderBy: { createdAt: 'desc' } },
        workLogs: { orderBy: { createdAt: 'desc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!workOrder) {
      return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(workOrder.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }
    if (ctx.isStaff && workOrder.assigneeId !== ctx.actor.id && workOrder.requesterId !== ctx.actor.id) {
      return NextResponse.json({ error: 'Forbidden: Work order is not assigned to you.' }, { status: 403 });
    }

    const empIds = Array.from(
      new Set(
        [
          workOrder.requesterId,
          workOrder.ownerId,
          workOrder.assigneeId,
          workOrder.supervisorId,
          workOrder.approverId,
          ...workOrder.workLogs.map((l) => l.actorId),
          ...workOrder.dispatches.map((d) => d.assigneeId),
          ...workOrder.dispatches.map((d) => d.dispatcherId),
        ].filter((v): v is string => Boolean(v))
      )
    );
    const emps = empIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: empIds } },
          select: { id: true, legalName: true, employeeNumber: true, jobTitle: true },
        })
      : [];
    const empMap = new Map(emps.map((e) => [e.id, e]));

    return NextResponse.json({
      workOrder,
      employeesById: Object.fromEntries(empMap),
    });
  } catch (error) {
    console.error('Operations work-order GET error:', error);
    return NextResponse.json({ error: 'Could not load work order details.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const { id } = await context.params;
    const existing = await prisma.opsWorkOrder.findUnique({
      where: { id },
      include: { service: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Work order not found.' }, { status: 404 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    if (ctx.isStaff) {
      if (existing.assigneeId !== ctx.actor.id && existing.requesterId !== ctx.actor.id) {
        return NextResponse.json({ error: 'Forbidden: Only assigned staff can update this work order.' }, { status: 403 });
      }
    }

    const body = await request.json();

    // Comment-only update
    if (body?.commentOnly && typeof body?.message === 'string' && body.message.trim()) {
      const log = await prisma.opsWorkLog.create({
        data: {
          workOrderId: existing.id,
          actorId: ctx.actor.id,
          entryType: 'COMMENT',
          message: body.message.trim(),
          attachmentsJson: Array.isArray(body?.attachments) ? JSON.stringify(body.attachments) : null,
        },
      });
      return NextResponse.json({ workOrder: existing, log });
    }

    const nextStatus = body?.status ? String(body.status).toUpperCase() : existing.status;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (nextStatus !== existing.status) {
      if (!isValidOpsTransition(existing.status, nextStatus)) {
        return NextResponse.json(
          { error: `Invalid state transition from ${existing.status} to ${nextStatus}.` },
          { status: 400 }
        );
      }

      if ((nextStatus === 'BLOCKED' || nextStatus === 'CANCELLED') && !reason) {
        return NextResponse.json(
          { error: `A reason is required when marking a work order ${nextStatus}.` },
          { status: 400 }
        );
      }

      if (nextStatus === 'CLOSED') {
        if (ctx.isStaff) {
          return NextResponse.json(
            { error: 'Forbidden: Staff cannot independently close a work order; supervisor or admin verification is required.' },
            { status: 403 }
          );
        }
        const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_work_orders', 'verify_close');
        if (denied) return denied;
        if (existing.service?.requiresVerification && existing.assigneeId === ctx.actor.id) {
          return NextResponse.json(
            { error: 'Separation of duties: The assignee who completed this work cannot independently verify and close it.' },
            { status: 403 }
          );
        }
      }
    }

    if (!ctx.isStaff && body?.assigneeId !== undefined && body.assigneeId !== existing.assigneeId) {
      const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_work_orders', 'assign_dispatch');
      if (denied) return denied;
    }

    const now = new Date();
    const updated = await prisma.opsWorkOrder.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        blockedReason: nextStatus === 'BLOCKED' ? reason : nextStatus === 'IN_PROGRESS' ? null : existing.blockedReason,
        assigneeId: !ctx.isStaff && body?.assigneeId !== undefined ? (body.assigneeId || null) : existing.assigneeId,
        supervisorId: !ctx.isStaff && body?.supervisorId !== undefined ? (body.supervisorId || null) : existing.supervisorId,
        priority: !ctx.isStaff && body?.priority ? String(body.priority).toUpperCase() : existing.priority,
        checklistJson: body?.checklist !== undefined ? JSON.stringify(body.checklist) : existing.checklistJson,
        evidenceUrlsJson: body?.evidenceUrls !== undefined ? JSON.stringify(body.evidenceUrls) : existing.evidenceUrlsJson,
        startedAt: nextStatus === 'IN_PROGRESS' && !existing.startedAt ? now : existing.startedAt,
        completedAt: nextStatus === 'COMPLETED' && !existing.completedAt ? now : existing.completedAt,
        verifiedAt: nextStatus === 'CLOSED' && !existing.verifiedAt ? now : existing.verifiedAt,
        closedAt: nextStatus === 'CLOSED' && !existing.closedAt ? now : existing.closedAt,
      },
      include: {
        site: { select: { id: true, code: true, name: true } },
        service: { select: { id: true, code: true, name: true } },
      },
    });

    if (nextStatus !== existing.status) {
      await prisma.opsWorkLog.create({
        data: {
          workOrderId: existing.id,
          actorId: ctx.actor.id,
          entryType: 'STATE_CHANGE',
          fromStatus: existing.status,
          toStatus: nextStatus,
          message: reason || `Status updated from ${existing.status} to ${nextStatus}.`,
        },
      });

      await logOpsAudit({
        actor: ctx.actor,
        action: 'OPS_WORK_ORDER_STATUS_CHANGED',
        targetType: 'OPS_WORK_ORDER',
        targetId: existing.id,
        subsidiaryId: existing.organizationId,
        metadata: { fromStatus: existing.status, toStatus: nextStatus, reason },
      });
    }

    return NextResponse.json({ workOrder: updated });
  } catch (error) {
    console.error('Operations work-order PATCH error:', error);
    return NextResponse.json({ error: 'Could not update work order.' }, { status: 500 });
  }
}
