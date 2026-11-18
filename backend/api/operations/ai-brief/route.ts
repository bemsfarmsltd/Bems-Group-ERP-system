import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

/**
 * Phase 4: AI-Assisted Operations Intelligence.
 * Strictly restricted to GMD ONLY per BEMS ERP boundary rules (no staff or admin AI fallback).
 */
export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasAnyRole(actor, ['GMD'])) {
      return NextResponse.json(
        { error: 'Forbidden: AI-Assisted Operations Intelligence is exclusively restricted to The Group Managing Director (GMD).' },
        { status: 403 }
      );
    }

    const now = new Date();
    const [workOrders, incidents, stockItems, handovers] = await Promise.all([
      prisma.opsWorkOrder.findMany({ take: 250, orderBy: { createdAt: 'desc' } }),
      prisma.opsIncident.findMany({ where: { status: { not: 'CLOSED' } }, take: 50 }),
      prisma.opsStockItem.findMany(),
      prisma.opsShiftHandover.findMany({ where: { acknowledgedAt: null }, take: 30 }),
    ]);

    const overdue = workOrders.filter((w) => w.dueAt && new Date(w.dueAt) < now && !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(w.status));
    const blocked = workOrders.filter((w) => w.status === 'BLOCKED');
    const criticalIncidents = incidents.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity));
    const lowStock = stockItems.filter((s) => s.quantityOnHand <= s.reorderLevel);

    const highlights: string[] = [];
    if (overdue.length > 0) highlights.push(`${overdue.length} work order(s) have breached SLA due targets and require dispatcher escalation.`);
    if (blocked.length > 0) highlights.push(`${blocked.length} active work order(s) are currently BLOCKED.`);
    if (criticalIncidents.length > 0) highlights.push(`${criticalIncidents.length} HIGH/CRITICAL incident(s) remain open awaiting root-cause resolution.`);
    if (lowStock.length > 0) highlights.push(`${lowStock.length} store/consumable SKU(s) are at or below reorder threshold.`);
    if (handovers.length > 0) highlights.push(`${handovers.length} shift handover(s) have not yet been acknowledged by the incoming officer.`);
    if (highlights.length === 0) highlights.push('All operational sites, SLAs, stock thresholds, and shift handovers are within healthy tolerances.');

    return NextResponse.json({
      generatedAt: now.toISOString(),
      roleScope: 'GMD_ONLY',
      briefTitle: 'Executive Operations Intelligence Digest',
      highlights,
      metrics: {
        overdueCount: overdue.length,
        blockedCount: blocked.length,
        criticalIncidentsCount: criticalIncidents.length,
        lowStockCount: lowStock.length,
        unacknowledgedHandoversCount: handovers.length,
      },
      advisoryOnly: true,
    });
  } catch (error) {
    console.error('Ops AI brief error:', error);
    return NextResponse.json({ error: 'Could not generate Operations Intelligence brief.' }, { status: 500 });
  }
}
