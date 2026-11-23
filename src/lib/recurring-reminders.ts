import { sendEmail } from '@/lib/email';
import { resolveModuleEmailRecipients } from '@/lib/email-routing';

export function computeNextDueDate(from: Date, interval?: string | null): Date {
  const next = new Date(from.getTime());
  const mode = (interval || 'MONTHLY').toUpperCase();
  if (mode === 'ANNUAL' || mode === 'YEARLY') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else if (mode === 'QUARTERLY') {
    next.setUTCMonth(next.getUTCMonth() + 3);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

export function checkRecurringDisbursementEligibility(req: {
  isRecurring?: boolean;
  recurringNextDueAt?: Date | string | null;
  recurringLastPaidAt?: Date | string | null;
}, now = new Date()): { allowed: boolean; message?: string } {
  if (!req.isRecurring) return { allowed: true };
  if (!req.recurringNextDueAt) return { allowed: true };

  const dueAt = new Date(req.recurringNextDueAt);
  if (Number.isNaN(dueAt.getTime())) return { allowed: true };

  // Restrict disbursement if a recurring commitment has already been paid for the current cycle and has not reached its next due date
  if (req.recurringLastPaidAt && now.getTime() < dueAt.getTime()) {
    const formattedDue = dueAt.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
    return {
      allowed: false,
      message: `Recurring disbursement blocked: next cycle is not due until ${formattedDue}.`,
    };
  }
  return { allowed: true };
}

export async function evaluateRecurringReminders(prismaClient: any) {
  const now = new Date();
  const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const dueSoon = await prismaClient.expenditureRequest.findMany({
    where: {
      isRecurring: true,
      recurringAutoPay: false,
      approvalStatus: 'APPROVED',
      recurringNextDueAt: {
        gte: now,
        lte: sevenDaysAhead,
      },
      OR: [
        { recurringReminderSentAt: null },
        { recurringReminderSentAt: { lt: sevenDaysAgo } },
      ],
    },
    include: {
      subsidiary: { select: { id: true, legalName: true } },
    },
    take: 50,
  });

  if (!dueSoon.length) return { notified: 0 };

  let notified = 0;
  for (const req of dueSoon) {
    // If this recurring commitment is already PAID or SETTLED for its initial cycle
    // and recurringLastPaidAt was not stamped yet, advance recurringNextDueAt to the next cycle
    // instead of sending a due-soon alert for an already-settled cycle.
    const isAlreadySettled = ['PAID', 'SETTLED'].includes(String(req.paymentStatus || '').toUpperCase());
    if (isAlreadySettled && !req.recurringLastPaidAt && req.recurringNextDueAt) {
      const nextCycleDate = computeNextDueDate(new Date(req.recurringNextDueAt), req.recurringInterval);
      await prismaClient.expenditureRequest.update({
        where: { id: req.id },
        data: {
          recurringLastPaidAt: req.paidAt || now,
          recurringNextDueAt: nextCycleDate,
          recurringReminderSentAt: now,
        },
      }).catch(() => {});
      continue;
    }

    // Atomically claim the reminder lock BEFORE dispatching any email or notification
    // so concurrent requests can never trigger duplicate emails.
    const claimResult = await prismaClient.expenditureRequest.updateMany({
      where: {
        id: req.id,
        OR: [
          { recurringReminderSentAt: null },
          { recurringReminderSentAt: { lt: sevenDaysAgo } },
        ],
      },
      data: {
        recurringReminderSentAt: now,
      },
    }).catch(() => ({ count: 0 }));

    if (!claimResult || claimResult.count === 0) {
      continue;
    }

    const dueStr = req.recurringNextDueAt
      ? new Date(req.recurringNextDueAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'within 7 days';
    const amountNaira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })
      .format(Number(req.amountMinor || 0) / 100);

    try {
      const { dispatchMatrixNotifications } = await import('@/lib/notifications/policy-matrix');
      await dispatchMatrixNotifications({
        eventKey: 'RECURRING_COMMITMENT_DUE',
        title: `Recurring Commitment Due: ${req.title}`,
        body: `${req.requestNumber} (${req.subsidiary?.legalName || 'BEMS'}) for ${amountNaira} is due on ${dueStr}. Auto-Pay is OFF.`,
        category: 'REQUESTS_APPROVALS',
        priority: 'IMPORTANT',
        actionLabel: 'Open Recurring Commitments',
        actionUrl: '/finance?tab=Recurring+commitments',
      });
    } catch (e) {
      console.warn('[Recurring Reminders] Matrix dispatch warning:', e);
    }

    notified += 1;
  }

  return { notified };
}
