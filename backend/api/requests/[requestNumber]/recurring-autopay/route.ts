import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { canApproveWalletRelease } from '@/lib/gmd-access';
import { checkApprovalPin } from '@/lib/wallet/approval-security';
import { liveWalletActor, WalletError, walletTransaction } from '@/lib/wallet/core';
import { walletHttp } from '@/lib/wallet/http';
import { sessionBinding } from '@/lib/wallet/security';
import { extractRequestForensics } from '@/lib/audit-forensics';

export async function POST(request: Request, context: { params: Promise<{ requestNumber: string }> }) {
  return walletHttp(request, async (actor) => {
    await sessionBinding(request, actor.id);
    if (!canApproveWalletRelease(actor)) {
      throw new WalletError('GMD_ONLY', 'Only the designated active GMD can enable or disable recurring Auto-Pay.', 403);
    }

    const { requestNumber } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.pin !== 'string' || !/^\d{8}$/.test(body.pin)) {
      throw new WalletError('INVALID_PIN', 'Enter your eight-digit GMD approval PIN.', 400);
    }
    const autoPay = Boolean(body.autoPay);

    const result = await walletTransaction(async (tx) => {
      const employee = await liveWalletActor(tx, actor, 'GMD');
      const confirmation = await checkApprovalPin(tx, employee, body.pin);
      if (confirmation instanceof WalletError) return confirmation;

      const target = await tx.expenditureRequest.findFirst({
        where: { OR: [{ id: requestNumber }, { requestNumber }] },
        select: { id: true, requestNumber: true, isRecurring: true, groupId: true, subsidiaryId: true },
      });
      if (!target) throw new WalletError('NOT_FOUND', 'Recurring request not found.', 404);
      if (!target.isRecurring) throw new WalletError('NOT_RECURRING', 'Only recurring commitments can use Auto-Pay.', 400);

      await tx.expenditureRequest.update({
        where: { id: target.id },
        data: { recurringAutoPay: autoPay },
      });

      const forensics = extractRequestForensics(request);
      await tx.auditEvent.create({
        data: {
          actorId: employee.id,
          actorName: employee.legalName,
          actorRole: employee.role,
          groupId: target.groupId,
          subsidiaryId: target.subsidiaryId,
          targetType: 'RECURRING_POLICY',
          targetId: target.id,
          action: autoPay ? 'RECURRING_AUTOPAY_ENABLED' : 'RECURRING_AUTOPAY_DISABLED',
          metadata: JSON.stringify({ requestNumber: target.requestNumber, autoPay }),
          correlationId: randomUUID(),
          module: 'WALLET',
          ...forensics,
        },
      });

      return { success: true, requestNumber: target.requestNumber, recurringAutoPay: autoPay };
    });
    if (result instanceof WalletError) throw result;
    return result;
  });
}
