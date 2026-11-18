import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveOperationsContext } from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request);
    if ('error' in ctx) return ctx.error;

    const where = ctx.useSubFilter && ctx.allowedSubIds.length > 0 ? { organizationId: { in: ctx.allowedSubIds } } : {};
    const now = new Date();

    const [subsidiaries, workOrders, incidents, assets, stockItems, handovers] = await Promise.all([
      prisma.organization.findMany({
        where: ctx.useSubFilter && ctx.allowedSubIds.length > 0 ? { id: { in: ctx.allowedSubIds } } : { status: 'ACTIVE' },
        select: { id: true, legalName: true, code: true },
        orderBy: { legalName: 'asc' },
      }),
      prisma.opsWorkOrder.findMany({ where }),
      prisma.opsIncident.findMany({ where }),
      prisma.opsAsset.findMany({ where }),
      prisma.opsStockItem.findMany({ where }),
      prisma.opsShiftHandover.findMany({ where }),
    ]);

    const byCompany = subsidiaries.map((sub) => {
      const subWos = workOrders.filter((w) => w.organizationId === sub.id);
      const completed = subWos.filter((w) => w.status === 'COMPLETED' || w.status === 'CLOSED').length;
      const overdue = subWos.filter((w) => w.dueAt && new Date(w.dueAt) < now && !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(w.status)).length;
      const openIncidents = incidents.filter((i) => i.organizationId === sub.id && i.status !== 'CLOSED').length;
      const lowStock = stockItems.filter((s) => s.organizationId === sub.id && s.quantityOnHand <= s.reorderLevel).length;

      return {
        organizationId: sub.id,
        legalName: sub.legalName,
        code: sub.code,
        totalWorkOrders: subWos.length,
        completedWorkOrders: completed,
        slaCompliancePct: subWos.length > 0 ? Math.round(((subWos.length - overdue) / subWos.length) * 100) : 100,
        openIncidents,
        lowStockItems: lowStock,
      };
    });

    return NextResponse.json({
      lastUpdatedAt: now.toISOString(),
      summary: {
        totalAssets: assets.length,
        assetsInMaintenance: assets.filter((a) => a.status === 'MAINTENANCE' || a.condition === 'FAULTY').length,
        lowStockCount: stockItems.filter((s) => s.quantityOnHand <= s.reorderLevel).length,
        unacknowledgedHandovers: handovers.filter((h) => !h.acknowledgedAt).length,
        openCriticalIncidents: incidents.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity) && i.status !== 'CLOSED').length,
      },
      byCompany,
    });
  } catch (error) {
    console.error('Ops analytics GET error:', error);
    return NextResponse.json({ error: 'Could not compute operations analytics.' }, { status: 500 });
  }
}
