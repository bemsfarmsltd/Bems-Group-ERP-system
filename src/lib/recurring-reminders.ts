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
    void import('@/lib/notifications/policy-matrix').then(m => m.dispatchMatrixNotifications({
      eventKey: 'RECURRING_COMMITMENT_DUE',
      title: `Recurring Commitment Due: ${req.title}`,
      body: `${req.requestNumber} (${req.subsidiary?.legalName || 'BEMS'}) for ₦${(Number(req.amountMinor || 0) / 100).toLocaleString('en-NG')} is due soon.`,
      category: 'REQUESTS_APPROVALS',
      priority: 'IMPORTANT',
      actionLabel: 'Open Recurring Commitments',
      actionUrl: '/finance?tab=Recurring+commitments',
    })).catch(() => {});
    const recipients = await resolveModuleEmailRecipients(prismaClient, 'finance', req.subsidiaryId);
    const dueStr = req.recurringNextDueAt
      ? new Date(req.recurringNextDueAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'within 7 days';
    const amountNaira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 })
      .format(Number(req.amountMinor || 0) / 100);

    for (const r of recipients) {
      await prismaClient.notification.create({
        data: {
          employeeId: r.id,
          type: 'RECURRING_DUE_REMINDER',
          title: `Recurring payment due in ≤7 days: ${req.title}`,
          body: `${req.requestNumber} (${req.subsidiary?.legalName || 'BEMS'}) for ${amountNaira} is due on ${dueStr}. Auto-Pay is OFF.`,
          actionUrl: `/finance?tab=Recurring+commitments`,
        },
      }).catch(() => {});

      await sendEmail({
        to: r.workEmail,
        subject: `[BEMS Finance] Recurring Payment Due ${dueStr}: ${req.title} (${req.requestNumber})`,
        eventType: 'RECURRING_DUE_REMINDER',
        html: `<p>Hello ${r.legalName},</p>
          <p>The recurring commitment <strong>${req.title}</strong> (${req.requestNumber}) for <strong>${req.subsidiary?.legalName || 'BEMS'}</strong> (${amountNaira}) is due on <strong>${dueStr}</strong>.</p>
          <p><strong>Auto-Pay is currently OFF</strong>, so manual GMD review and release will be required on the due date.</p>`,
        text: `Recurring commitment ${req.title} (${req.requestNumber}) for ${amountNaira} is due on ${dueStr}. Auto-Pay is OFF.`,
      }).catch(() => {});
    }

    await prismaClient.expenditureRequest.update({
      where: { id: req.id },
      data: { recurringReminderSentAt: now },
    }).catch(() => {});
    notified += 1;
  }

  return { notified };
}
