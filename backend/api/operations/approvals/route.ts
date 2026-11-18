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
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const where: Record<string, any> = ctx.useSubFilter ? { organizationId: { in: ctx.allowedSubIds } } : {};
    const approvals = await prisma.opsApprovalDecision.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
      include: {
        workOrder: {
          select: { id: true, workOrderNumber: true, title: true, priority: true, status: true },
        },
      },
    });

    const empIds = Array.from(
      new Set(approvals.flatMap((a) => [a.initiatorId, a.approverId]).filter((v): v is string => Boolean(v)))
    );
    const emps = empIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: empIds } },
          select: { id: true, legalName: true },
        })
      : [];
    const empMap = new Map(emps.map((e) => [e.id, e.legalName]));

    return NextResponse.json({
      approvals: approvals.map((a) => ({
        ...a,
        initiatorName: empMap.get(a.initiatorId) || 'Initiator',
        approverName: a.approverId ? empMap.get(a.approverId) || 'Approver' : null,
      })),
    });
  } catch (error) {
    console.error('Operations approvals GET error:', error);
    return NextResponse.json({ error: 'Could not load operational approvals.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_core', 'approve_workflows');
    if (denied) return denied;

    const body = await request.json();
    const id = String(body?.id || '').trim();
    const decision = String(body?.decision || '').toUpperCase();
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!id || !['APPROVED', 'REJECTED', 'REVISION_REQUESTED'].includes(decision)) {
      return NextResponse.json({ error: 'Valid approval id and decision (APPROVED, REJECTED, REVISION_REQUESTED) are required.' }, { status: 400 });
    }

    const existing = await prisma.opsApprovalDecision.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Approval record not found.' }, { status: 404 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }
    if (existing.initiatorId === ctx.actor.id) {
      return NextResponse.json(
        { error: 'Separation of duties: You cannot approve or decide your own operational request.' },
        { status: 403 }
      );
    }

    const updated = await prisma.opsApprovalDecision.update({
      where: { id },
      data: {
        decision,
        approverId: ctx.actor.id,
        reason: reason || null,
        decidedAt: new Date(),
      },
    });

    await prisma.opsWorkLog.create({
      data: {
        workOrderId: existing.workOrderId,
        actorId: ctx.actor.id,
        entryType: 'APPROVAL',
        message: `Approval decision: ${decision}${reason ? ` — ${reason}` : ''}`,
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: `OPS_APPROVAL_${decision}`,
      targetType: 'OPS_APPROVAL',
      targetId: updated.id,
      subsidiaryId: existing.organizationId,
      metadata: { workOrderId: existing.workOrderId, decision, reason },
    });

    return NextResponse.json({ approval: updated });
  } catch (error) {
    console.error('Operations approvals POST error:', error);
    return NextResponse.json({ error: 'Could not record operational approval decision.' }, { status: 500 });
  }
}
