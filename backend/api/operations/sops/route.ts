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

    const where = ctx.useSubFilter && ctx.allowedSubIds.length > 0 ? { organizationId: { in: ctx.allowedSubIds } } : {};
    const sops = await prisma.opsSopDocument.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 100,
    });
    return NextResponse.json({ sops });
  } catch (error) {
    console.error('Ops SOPs GET error:', error);
    return NextResponse.json({ error: 'Could not load SOP documents.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_assurance', 'manage_sops_inspections');
    if (denied) return denied;

    const body = await request.json();
    const organizationId = String(body?.organizationId || '').trim();
    const title = String(body?.title || '').trim();
    const content = String(body?.content || '').trim();
    if (!organizationId || !title || !content) {
      return NextResponse.json({ error: 'organizationId, title, and content are required.' }, { status: 400 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const code = String(body?.code || `SOP-${Date.now().toString().slice(-6)}`).trim().toUpperCase();
    const sop = await prisma.opsSopDocument.create({
      data: {
        organizationId,
        serviceId: body?.serviceId || null,
        code,
        title,
        version: String(body?.version || '1.0'),
        content,
        checklistTemplateJson: Array.isArray(body?.checklistTemplate) ? JSON.stringify(body.checklistTemplate) : null,
        createdById: ctx.actor.id,
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_SOP_CREATED',
      targetType: 'OPS_SOP',
      targetId: sop.id,
      subsidiaryId: sop.organizationId,
      metadata: { code: sop.code, version: sop.version },
    });

    return NextResponse.json({ sop }, { status: 201 });
  } catch (error) {
    console.error('Ops SOPs POST error:', error);
    return NextResponse.json({ error: 'Could not create SOP document.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_assurance', 'manage_sops_inspections');
    if (denied) return denied;

    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'SOP id is required.' }, { status: 400 });

    const existing = await prisma.opsSopDocument.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'SOP not found.' }, { status: 404 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const updated = await prisma.opsSopDocument.update({
      where: { id },
      data: {
        title: body?.title ? String(body.title).trim() : existing.title,
        version: body?.version ? String(body.version).trim() : existing.version,
        content: body?.content ? String(body.content).trim() : existing.content,
        status: body?.status ? String(body.status).toUpperCase() : existing.status,
      },
    });
    return NextResponse.json({ sop: updated });
  } catch (error) {
    console.error('Ops SOPs PATCH error:', error);
    return NextResponse.json({ error: 'Could not update SOP document.' }, { status: 500 });
  }
}
