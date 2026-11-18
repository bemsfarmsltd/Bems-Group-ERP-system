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
    if (ctx.isStaff) {
      where.OR = [{ outgoingOfficerId: ctx.actor.id }, { incomingOfficerId: ctx.actor.id }];
    }

    const handovers = await prisma.opsShiftHandover.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    return NextResponse.json({ handovers });
  } catch (error) {
    console.error('Ops handovers GET error:', error);
    return NextResponse.json({ error: 'Could not load shift handovers.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    if (!ctx.isStaff) {
      const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_governance', 'manage_handovers');
      if (denied) return denied;
    }

    const body = await request.json();
    const shiftLabel = String(body?.shiftLabel || '').trim();
    const openItemsSummary = String(body?.openItemsSummary || '').trim();
    if (!shiftLabel || !openItemsSummary) {
      return NextResponse.json({ error: 'shiftLabel and openItemsSummary are required.' }, { status: 400 });
    }

    let organizationId = String(body?.organizationId || '').trim();
    if (!organizationId) {
      organizationId = ctx.allowedSubIds[0] || (await prisma.organization.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } }))?.id || '';
    }
    if (!organizationId) return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const handover = await prisma.opsShiftHandover.create({
      data: {
        organizationId,
        siteId: body?.siteId || null,
        shiftLabel,
        outgoingOfficerId: ctx.actor.id,
        incomingOfficerId: body?.incomingOfficerId || null,
        openItemsSummary,
        incidentsSummary: body?.incidentsSummary ? String(body.incidentsSummary).trim() : null,
        criticalRisks: body?.criticalRisks ? String(body.criticalRisks).trim() : null,
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_HANDOVER_CREATED',
      targetType: 'OPS_HANDOVER',
      targetId: handover.id,
      subsidiaryId: handover.organizationId,
      metadata: { shiftLabel: handover.shiftLabel },
    });

    return NextResponse.json({ handover }, { status: 201 });
  } catch (error) {
    console.error('Ops handovers POST error:', error);
    return NextResponse.json({ error: 'Could not create shift handover.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'Handover id is required.' }, { status: 400 });

    const existing = await prisma.opsShiftHandover.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Handover not found.' }, { status: 404 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }
    if (existing.outgoingOfficerId === ctx.actor.id) {
      return NextResponse.json({ error: 'Outgoing officer cannot acknowledge their own handover.' }, { status: 403 });
    }

    const updated = await prisma.opsShiftHandover.update({
      where: { id },
      data: {
        incomingOfficerId: existing.incomingOfficerId || ctx.actor.id,
        acknowledgedAt: new Date(),
      },
    });
    return NextResponse.json({ handover: updated });
  } catch (error) {
    console.error('Ops handovers PATCH error:', error);
    return NextResponse.json({ error: 'Could not acknowledge shift handover.' }, { status: 500 });
  }
}
