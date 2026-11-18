import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logOpsAudit, requireCustomAdminOpsAction, resolveOperationsContext } from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const where: Record<string, any> =
      ctx.useSubFilter && ctx.allowedSubIds.length > 0 ? { organizationId: { in: ctx.allowedSubIds } } : {};
    if (ctx.isStaff) where.inspectorId = ctx.actor.id;

    const inspections = await prisma.opsInspection.findMany({
      where,
      orderBy: { inspectedAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ inspections });
  } catch (error) {
    console.error('Ops inspections GET error:', error);
    return NextResponse.json({ error: 'Could not load inspections.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    if (!ctx.isStaff) {
      const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_assurance', 'manage_sops_inspections');
      if (denied) return denied;
    }

    const body = await request.json();
    const title = String(body?.title || '').trim();
    if (!title) return NextResponse.json({ error: 'Inspection title is required.' }, { status: 400 });

    let organizationId = String(body?.organizationId || '').trim();
    if (!organizationId) {
      organizationId = ctx.allowedSubIds[0] || (await prisma.organization.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } }))?.id || '';
    }
    if (!organizationId) return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const inspection = await prisma.opsInspection.create({
      data: {
        organizationId,
        siteId: body?.siteId || null,
        workOrderId: body?.workOrderId || null,
        sopId: body?.sopId || null,
        inspectorId: ctx.actor.id,
        title,
        checklistResultsJson: body?.checklistResults ? JSON.stringify(body.checklistResults) : null,
        scorePct: Math.min(100, Math.max(0, Number(body?.scorePct ?? 100))),
        outcome: String(body?.outcome || 'PASS').toUpperCase(),
        notes: body?.notes ? String(body.notes).trim() : null,
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_INSPECTION_RECORDED',
      targetType: 'OPS_INSPECTION',
      targetId: inspection.id,
      subsidiaryId: inspection.organizationId,
      metadata: { title: inspection.title, outcome: inspection.outcome, scorePct: inspection.scorePct },
    });

    return NextResponse.json({ inspection }, { status: 201 });
  } catch (error) {
    console.error('Ops inspections POST error:', error);
    return NextResponse.json({ error: 'Could not record inspection.' }, { status: 500 });
  }
}
