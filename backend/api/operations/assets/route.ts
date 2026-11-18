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
    if (ctx.isStaff) where.custodianId = ctx.actor.id;

    const assets = await prisma.opsAsset.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      take: 150,
    });
    return NextResponse.json({ assets });
  } catch (error) {
    console.error('Ops assets GET error:', error);
    return NextResponse.json({ error: 'Could not load operational assets.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_resources', 'manage_assets_fleet');
    if (denied) return denied;

    const body = await request.json();
    const organizationId = String(body?.organizationId || '').trim();
    const name = String(body?.name || '').trim();
    if (!organizationId || !name) {
      return NextResponse.json({ error: 'organizationId and asset name are required.' }, { status: 400 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const assetTag = String(body?.assetTag || `AST-${Date.now().toString().slice(-6)}`).trim().toUpperCase();
    const asset = await prisma.opsAsset.create({
      data: {
        assetTag,
        organizationId,
        siteId: body?.siteId || null,
        name,
        category: String(body?.category || 'EQUIPMENT').toUpperCase(),
        serialNumber: body?.serialNumber ? String(body.serialNumber).trim() : null,
        custodianId: body?.custodianId || null,
        condition: String(body?.condition || 'GOOD').toUpperCase(),
        status: body?.custodianId ? 'ASSIGNED' : String(body?.status || 'AVAILABLE').toUpperCase(),
        nextServiceDueAt: body?.nextServiceDueAt ? new Date(body.nextServiceDueAt) : null,
      },
    });

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_ASSET_CREATED',
      targetType: 'OPS_ASSET',
      targetId: asset.id,
      subsidiaryId: asset.organizationId,
      metadata: { assetTag: asset.assetTag, name: asset.name },
    });

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error('Ops assets POST error:', error);
    return NextResponse.json({ error: 'Could not register asset.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_resources', 'manage_assets_fleet');
    if (denied) return denied;

    const body = await request.json();
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'Asset id is required.' }, { status: 400 });

    const existing = await prisma.opsAsset.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(existing.organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const updated = await prisma.opsAsset.update({
      where: { id },
      data: {
        custodianId: body?.custodianId !== undefined ? body.custodianId || null : existing.custodianId,
        condition: body?.condition ? String(body.condition).toUpperCase() : existing.condition,
        status: body?.status ? String(body.status).toUpperCase() : existing.status,
        siteId: body?.siteId !== undefined ? body.siteId || null : existing.siteId,
      },
    });
    return NextResponse.json({ asset: updated });
  } catch (error) {
    console.error('Ops assets PATCH error:', error);
    return NextResponse.json({ error: 'Could not update asset.' }, { status: 500 });
  }
}
