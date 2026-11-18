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
    const items = await prisma.opsStockItem.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { movements: { orderBy: { createdAt: 'desc' }, take: 5 } },
      take: 150,
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error('Ops stock GET error:', error);
    return NextResponse.json({ error: 'Could not load stock inventory.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const denied = requireCustomAdminOpsAction(ctx.actor, 'operations_resources', 'manage_stock');
    if (denied) return denied;

    const body = await request.json();

    // Stock movement on existing item
    if (body?.stockItemId) {
      const stockItemId = String(body.stockItemId).trim();
      const movementType = String(body?.movementType || 'OUT').toUpperCase();
      const quantity = Math.max(1, Math.floor(Number(body?.quantity || 0)));
      const reason = String(body?.reason || '').trim();
      if (!reason || !['IN', 'OUT', 'ADJUST', 'RETURN'].includes(movementType)) {
        return NextResponse.json({ error: 'Valid movementType, positive quantity, and reason are required.' }, { status: 400 });
      }

      const item = await prisma.opsStockItem.findUnique({ where: { id: stockItemId } });
      if (!item) return NextResponse.json({ error: 'Stock item not found.' }, { status: 404 });
      if (ctx.useSubFilter && !ctx.allowedSubIds.includes(item.organizationId)) {
        return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
      }

      const delta = movementType === 'OUT' ? -quantity : quantity;
      const nextQty = movementType === 'ADJUST' ? quantity : item.quantityOnHand + delta;
      if (nextQty < 0) {
        return NextResponse.json(
          { error: `Insufficient stock: ${item.name} only has ${item.quantityOnHand} ${item.unit} on hand.` },
          { status: 400 }
        );
      }

      const [updatedItem, movement] = await prisma.$transaction([
        prisma.opsStockItem.update({
          where: { id: item.id },
          data: { quantityOnHand: nextQty },
        }),
        prisma.opsStockMovement.create({
          data: {
            stockItemId: item.id,
            movementType,
            quantity,
            workOrderId: body?.workOrderId || null,
            actorId: ctx.actor.id,
            reason,
          },
        }),
      ]);

      await logOpsAudit({
        actor: ctx.actor,
        action: `OPS_STOCK_${movementType}`,
        targetType: 'OPS_STOCK',
        targetId: item.id,
        subsidiaryId: item.organizationId,
        metadata: { sku: item.sku, quantity, nextQty, reason },
      });

      return NextResponse.json({ item: updatedItem, movement });
    }

    // Create new stock item
    const organizationId = String(body?.organizationId || '').trim();
    const name = String(body?.name || '').trim();
    if (!organizationId || !name) {
      return NextResponse.json({ error: 'organizationId and item name are required.' }, { status: 400 });
    }
    if (ctx.useSubFilter && !ctx.allowedSubIds.includes(organizationId)) {
      return NextResponse.json({ error: 'Forbidden for this subsidiary.' }, { status: 403 });
    }

    const sku = String(body?.sku || `SKU-${Date.now().toString().slice(-6)}`).trim().toUpperCase();
    const item = await prisma.opsStockItem.create({
      data: {
        organizationId,
        siteId: body?.siteId || null,
        sku,
        name,
        unit: String(body?.unit || 'PCS').toUpperCase(),
        quantityOnHand: Math.max(0, Math.floor(Number(body?.quantityOnHand || 0))),
        reorderLevel: Math.max(0, Math.floor(Number(body?.reorderLevel || 5))),
      },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('Ops stock POST error:', error);
    return NextResponse.json({ error: 'Could not process stock operation.' }, { status: 500 });
  }
}
