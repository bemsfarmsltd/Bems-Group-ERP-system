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
    if (ctx.isStaff) where.OR = [{ reporterId: ctx.actor.id }, { ownerId: ctx.actor.id }];

    const incidents = await prisma.opsIncident.findMany({
      where,
      orderBy: [{ reportedAt: 'desc' }],
      take: 100,
    });
    return NextResponse.json({ incidents });
  } catch (error) {
    console.error('Ops incidents GET error:', error);
    return NextResponse.json({ error: 'Could not load incidents.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    if (!ctx.isStaff) {
      const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_assurance', 'manage_incidents');
      if (denied) return denied;
    }

    const body = await request.json();
    const title = String(body?.title || '').trim();
    const description = String(body?.description || '').trim();
    if (!title || !description) {
      return NextResponse.json({ error: 'Incident title and description are required.' }, { status: 400 });
    }

    let organizationId = String(body?.organizationId || '').trim();
    if (!organizationId) {
      organizationId = ctx.allowedSubIds[0] || (await prisma.organization.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } }))?.id || '';
    }
    if (!organizationId) return NextResponse.json({ error: 'organizationId is required.' }, { status: 400 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const count = await prisma.opsIncident.count();
    const incidentNumber = `INC-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const incident = await prisma.opsIncident.create({
      data: {
        incidentNumber,
        organizationId,
        siteId: body?.siteId || null,
        workOrderId: body?.workOrderId || null,
        reporterId: ctx.actor.id,
        ownerId: !ctx.isStaff ? body?.ownerId || null : null,
        severity: String(body?.severity || 'MEDIUM').toUpperCase(),
        category: String(body?.category || 'OPERATIONAL').toUpperCase(),
        title,
        description,
        status: 'OPEN',
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_INCIDENT_REPORTED',
      targetType: 'OPS_INCIDENT',
      targetId: incident.id,
      subsidiaryId: incident.organizationId,
      metadata: { incidentNumber: incident.incidentNumber, severity: incident.severity },
    });

    return NextResponse.json({ incident }, { status: 201 });
  } catch (error) {
    console.error('Ops incidents POST error:', error);
    return NextResponse.json({ error: 'Could not report incident.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'Incident id is required.' }, { status: 400 });

    const existing = await prisma.opsIncident.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Incident not found.' }, { status: 404 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const nextStatus = body?.status ? String(body.status).toUpperCase() : existing.status;
    if (nextStatus === 'CLOSED') {
      const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_assurance', 'close_incidents');
      if (denied) return denied;
    } else {
      const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_assurance', 'manage_incidents');
      if (denied) return denied;
    }

    const rootCause = body?.rootCause !== undefined ? String(body.rootCause || '').trim() : existing.rootCause || '';
    const correctiveAction =
      body?.correctiveAction !== undefined ? String(body.correctiveAction || '').trim() : existing.correctiveAction || '';

    if (
      (nextStatus === 'RESOLVED' || nextStatus === 'CLOSED') &&
      ['HIGH', 'CRITICAL'].includes(existing.severity) &&
      (!rootCause || !correctiveAction)
    ) {
      return NextResponse.json(
        { error: 'HIGH and CRITICAL incidents require both rootCause and correctiveAction before resolution or closure.' },
        { status: 400 }
      );
    }

    const updated = await prisma.opsIncident.update({
      where: { id },
      data: {
        status: nextStatus,
        rootCause: rootCause || null,
        correctiveAction: correctiveAction || null,
        ownerId: body?.ownerId !== undefined ? body.ownerId || null : existing.ownerId,
        resolvedAt: (nextStatus === 'RESOLVED' || nextStatus === 'CLOSED') && !existing.resolvedAt ? new Date() : existing.resolvedAt,
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_INCIDENT_UPDATED',
      targetType: 'OPS_INCIDENT',
      targetId: updated.id,
      subsidiaryId: updated.organizationId,
      metadata: { incidentNumber: updated.incidentNumber, status: updated.status },
    });

    return NextResponse.json({ incident: updated });
  } catch (error) {
    console.error('Ops incidents PATCH error:', error);
    return NextResponse.json({ error: 'Could not update incident.' }, { status: 500 });
  }
}
