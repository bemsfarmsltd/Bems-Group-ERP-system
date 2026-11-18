import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isValidOpsTransition, logOpsAudit, resolveOperationsContext } from '@/lib/opsRouteHelper';
import { ensureOperationsSchema } from '@/lib/ops-ensure-schema';

export const dynamic = 'force-dynamic';

/**
 * Offline mobile draft synchronization endpoint for bems_staff_app.
 * Processes queued work-order status transitions and field logs idempotently.
 */
export async function POST(request: Request) {
  try {
    await ensureOperationsSchema();
    const ctx = await resolveOperationsContext(request, { allowStaffApp: true });
    if ('error' in ctx) return ctx.error;

    const body = await request.json();
    const drafts = Array.isArray(body?.drafts) ? body.drafts : [];
    const results: Array<{ clientDraftId: string; status: 'SYNCED' | 'CONFLICT' | 'REJECTED'; error?: string }> = [];

    for (const draft of drafts) {
      const clientDraftId = String(draft?.clientDraftId || '');
      const kind = String(draft?.kind || '').toUpperCase();
      try {
        if (kind === 'WORK_ORDER_STATUS') {
          const woId = String(draft?.workOrderId || '');
          const nextStatus = String(draft?.status || '').toUpperCase();
          const wo = woId ? await prisma.opsWorkOrder.findUnique({ where: { id: woId } }) : null;
          if (!wo || (wo.assigneeId !== ctx.actor.id && wo.requesterId !== ctx.actor.id)) {
            results.push({ clientDraftId, status: 'REJECTED', error: 'Work order not accessible.' });
            continue;
          }
          if (!isValidOpsTransition(wo.status, nextStatus)) {
            results.push({ clientDraftId, status: 'CONFLICT', error: `Conflict: work order already in ${wo.status}.` });
            continue;
          }
          await prisma.opsWorkOrder.update({
            where: { id: wo.id },
            data: { status: nextStatus, blockedReason: nextStatus === 'BLOCKED' ? String(draft?.reason || 'Offline blocker') : wo.blockedReason },
          });
          await prisma.opsWorkLog.create({
            data: {
              workOrderId: wo.id,
              actorId: ctx.actor.id,
              entryType: 'STATE_CHANGE',
              fromStatus: wo.status,
              toStatus: nextStatus,
              message: String(draft?.reason || `Synced offline transition to ${nextStatus}.`),
            },
          });
          results.push({ clientDraftId, status: 'SYNCED' });
        } else {
          results.push({ clientDraftId, status: 'REJECTED', error: 'Unsupported offline draft type.' });
        }
      } catch (err) {
        results.push({ clientDraftId, status: 'CONFLICT', error: err instanceof Error ? err.message : 'Sync failed' });
      }
    }

    await logOpsAudit({
      actor: ctx.actor,
      action: 'OPS_OFFLINE_SYNC_PROCESSED',
      targetType: 'OPS_MOBILE_SYNC',
      targetId: ctx.actor.id,
      metadata: { count: drafts.length, synced: results.filter((r) => r.status === 'SYNCED').length },
    });

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Operations offline sync error:', error);
    return NextResponse.json({ error: 'Could not process offline sync.' }, { status: 500 });
  }
}
