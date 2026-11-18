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

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('organizationId') || '';

    const where: Record<string, any> = orgId
      ? { organizationId: orgId }
      : ctx.useSubFilter
        ? { organizationId: { in: ctx.allowedSubIds } }
        : {};

    const services = await prisma.opsServiceDefinition.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({ services });
  } catch (error) {
    console.error('Operations services GET error:', error);
    return NextResponse.json({ error: 'Could not load service catalogue.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_setup', 'manage_sites_services');
    if (denied) return denied;

    const body = await request.json();
    const organizationId = String(body?.organizationId || '').trim();
    const name = String(body?.name || '').trim();
    const codeInput = String(body?.code || '').trim().toUpperCase();
    if (!organizationId || !name) {
      return NextResponse.json({ error: 'organizationId and service name are required.' }, { status: 400 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const code = codeInput || `SRV-${Date.now().toString().slice(-6)}`;
    const service = await prisma.opsServiceDefinition.create({
      data: {
        organizationId,
        departmentId: body?.departmentId || null,
        code,
        name,
        category: String(body?.category || 'FIELD_SERVICE').toUpperCase(),
        description: body?.description ? String(body.description).trim() : null,
        ownerId: body?.ownerId || null,
        slaAcknowledgeMins: Math.max(5, Number(body?.slaAcknowledgeMins || 60)),
        slaResolveHours: Math.max(1, Number(body?.slaResolveHours || 24)),
        requiresVerification: Boolean(body?.requiresVerification),
        requiresApproval: Boolean(body?.requiresApproval),
        isClientFacing: Boolean(body?.isClientFacing),
        status: 'ACTIVE',
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_SERVICE_CREATED',
      targetType: 'OPS_SERVICE',
      targetId: service.id,
      subsidiaryId: service.organizationId,
      metadata: { code: service.code, name: service.name },
    });

    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    console.error('Operations services POST error:', error);
    return NextResponse.json({ error: 'Could not create service definition.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_setup', 'manage_sites_services');
    if (denied) return denied;

    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'Service id is required.' }, { status: 400 });

    const existing = await prisma.opsServiceDefinition.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Service definition not found.' }, { status: 404 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const updated = await prisma.opsServiceDefinition.update({
      where: { id },
      data: {
        name: body?.name ? String(body.name).trim() : existing.name,
        category: body?.category ? String(body.category).toUpperCase() : existing.category,
        description: body?.description !== undefined ? (body.description ? String(body.description).trim() : null) : existing.description,
        slaAcknowledgeMins: body?.slaAcknowledgeMins ? Math.max(5, Number(body.slaAcknowledgeMins)) : existing.slaAcknowledgeMins,
        slaResolveHours: body?.slaResolveHours ? Math.max(1, Number(body.slaResolveHours)) : existing.slaResolveHours,
        requiresVerification: body?.requiresVerification !== undefined ? Boolean(body.requiresVerification) : existing.requiresVerification,
        requiresApproval: body?.requiresApproval !== undefined ? Boolean(body.requiresApproval) : existing.requiresApproval,
        status: body?.status ? String(body.status).toUpperCase() : existing.status,
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_SERVICE_UPDATED',
      targetType: 'OPS_SERVICE',
      targetId: updated.id,
      subsidiaryId: updated.organizationId,
      metadata: { code: updated.code, status: updated.status },
    });

    return NextResponse.json({ service: updated });
  } catch (error) {
    console.error('Operations services PATCH error:', error);
    return NextResponse.json({ error: 'Could not update service definition.' }, { status: 500 });
  }
}
