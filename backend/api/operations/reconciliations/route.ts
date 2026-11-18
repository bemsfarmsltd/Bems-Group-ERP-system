import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logOpsAudit, requireCustomAdminOpsAction, resolveOperationsContext } from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const where = ctx.useSubFilter && ctx.allowedSubIds.length > 0 ? { organizationId: { in: ctx.allowedSubIds } } : {};
    const runs = await prisma.opsReconciliationRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { exceptions: { orderBy: { createdAt: 'desc' } } },
      take: 60,
    });
    return NextResponse.json({ runs });
  } catch (error) {
    console.error('Ops reconciliations GET error:', error);
    return NextResponse.json({ error: 'Could not load reconciliations.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_governance', 'manage_reconciliations');
    if (denied) return denied;

    const body = await request.json();
    const organizationId = String(body?.organizationId || '').trim();
    const period = String(body?.period || '').trim();
    const sourceSystem = String(body?.sourceSystem || 'FINANCE').toUpperCase();
    if (!organizationId || !period) {
      return NextResponse.json({ error: 'organizationId and period are required.' }, { status: 400 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const exceptionsInput = Array.isArray(body?.exceptions) ? body.exceptions : [];
    const run = await prisma.opsReconciliationRun.create({
      data: {
        organizationId,
        period,
        sourceSystem,
        matchedCount: Math.max(0, Number(body?.matchedCount || 0)),
        exceptionCount: exceptionsInput.length || Math.max(0, Number(body?.exceptionCount || 0)),
        createdById: ctx.actor.id,
        exceptions: exceptionsInput.length
          ? {
              create: exceptionsInput.map((ex: any) => ({
                exceptionType: String(ex?.exceptionType || 'UNMATCHED').toUpperCase(),
                referenceCode: String(ex?.referenceCode || `EXC-${Date.now().toString().slice(-4)}`),
                ownerId: ex?.ownerId || null,
                resolutionNote: ex?.resolutionNote || null,
              })),
            }
          : undefined,
      },
      include: { exceptions: true },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_RECONCILIATION_CREATED',
      targetType: 'OPS_RECONCILIATION',
      targetId: run.id,
      subsidiaryId: run.organizationId,
      metadata: { period: run.period, sourceSystem: run.sourceSystem, exceptionCount: run.exceptionCount },
    });

    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    console.error('Ops reconciliations POST error:', error);
    return NextResponse.json({ error: 'Could not create reconciliation run.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_governance', 'manage_reconciliations');
    if (denied) return denied;

    const body = await request.json();
    if (body?.exceptionId) {
      const updatedExc = await prisma.opsReconciliationException.update({
        where: { id: String(body.exceptionId) },
        data: {
          status: 'RESOLVED',
          resolutionNote: String(body?.resolutionNote || 'Investigated and resolved').trim(),
        },
      });
      return NextResponse.json({ exception: updatedExc });
    }

    const runId = String(body?.runId || '').trim();
    const existing = runId ? await prisma.opsReconciliationRun.findUnique({ where: { id: runId } }) : null;
    if (!existing) return NextResponse.json({ error: 'Reconciliation run not found.' }, { status: 404 });
    if (existing.createdById === ctx.actor.id && String(body?.status || '').toUpperCase() === 'CLOSED') {
      return NextResponse.json({ error: 'Separation of duties: Creator cannot independently close a reconciliation run.' }, { status: 403 });
    }

    const updated = await prisma.opsReconciliationRun.update({
      where: { id: runId },
      data: {
        status: String(body?.status || 'VERIFIED_BY_FINANCE').toUpperCase(),
        verifiedById: ctx.actor.id,
      },
    });
    return NextResponse.json({ run: updated });
  } catch (error) {
    console.error('Ops reconciliations PATCH error:', error);
    return NextResponse.json({ error: 'Could not update reconciliation.' }, { status: 500 });
  }
}
