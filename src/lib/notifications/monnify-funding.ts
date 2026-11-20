import { prisma } from '@/lib/prisma';
import { getExecutiveRecipients, sendEmail } from '@/lib/email';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNaira(minor: number | bigint): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(minor) / 100);
}

export interface MonnifyWalletFundedNotificationParams {
  deltaMinor: bigint | number;
  previousBalanceMinor?: bigint | number | null;
  newBalanceMinor?: bigint | number | null;
  sourceAccount: string;
  reference?: string | null;
  source: 'WEBHOOK' | 'BALANCE_SYNC';
}

/**
 * Dispatches in-app SystemNotification records and Resend emails to all active
 * GMD and Super Admin users when the Monnify company disbursement wallet is funded.
 */
export async function notifyExecutivesMonnifyWalletFunded(params: MonnifyWalletFundedNotificationParams) {
  try {
    const delta = Number(params.deltaMinor || 0);
    if (!Number.isFinite(delta) || delta <= 0) {
      return { success: false, skipped: true };
    }

    const amountFormatted = formatNaira(delta);
    const prevFormatted =
      params.previousBalanceMinor != null ? formatNaira(params.previousBalanceMinor) : null;
    const newFormatted =
      params.newBalanceMinor != null ? formatNaira(params.newBalanceMinor) : null;

    const executives = await prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'] },
      },
      select: { id: true, legalName: true, workEmail: true },
    });

    const title = `Monnify Wallet Funded: +${amountFormatted}`;
    const bodyText = newFormatted
      ? `Your Monnify company wallet (${params.sourceAccount}) was funded with +${amountFormatted}. Verified balance is now ${newFormatted}${prevFormatted ? ` (previously ${prevFormatted})` : ''}.`
      : `Your Monnify company wallet (${params.sourceAccount}) received a credit of +${amountFormatted}${params.reference ? ` (Ref: ${params.reference})` : ''}.`;

    // 1. In-app SystemNotifications for all active GMD & Super Admins
    for (const exec of executives) {
      await prisma.systemNotification
        .create({
          data: {
            employeeId: exec.id,
            category: 'PAYROLL_DEDUCTIONS',
            priority: 'IMPORTANT',
            kind: 'MONNIFY_WALLET_FUNDED',
            title,
            body: bodyText,
            actionLabel: 'Open Wallet Funding',
            actionUrl: '/wallet/funding',
            linkUrl: '/wallet/funding',
            metadata: {
              deltaMinor: delta,
              previousBalanceMinor:
                params.previousBalanceMinor != null ? Number(params.previousBalanceMinor) : null,
              newBalanceMinor:
                params.newBalanceMinor != null ? Number(params.newBalanceMinor) : null,
              sourceAccount: params.sourceAccount,
              reference: params.reference || null,
              source: params.source,
            },
          },
        })
        .catch(() => {});
    }

    // 2. Resend Email to all executive recipients
    const recipients = await getExecutiveRecipients();
    const emails = Array.from(
      new Set([
        ...recipients.map((r) => r.email),
        ...executives.map((e) => e.workEmail).filter((e): e is string => Boolean(e && e.includes('@'))),
      ])
    );

    const html = `
    <div style="background:#f8fafc;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ea580c;">BEMS Group · Treasury &amp; Monnify Wallet</div>
          <h1 style="margin:6px 0 8px;font-size:20px;font-weight:800;color:#0f172a;">Monnify Wallet Funded</h1>
          <span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:#dcfce7;color:#166534;">CREDIT CONFIRMED · +${escapeHtml(amountFormatted)}</span>
        </div>

        <div style="padding:20px 24px;font-size:14px;line-height:1.6;color:#334155;">
          <p style="margin:0 0 16px;">${escapeHtml(bodyText)}</p>

          <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Monnify Wallet Account</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${escapeHtml(params.sourceAccount)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Amount Credited</td>
              <td style="padding:10px 14px;font-size:14px;font-weight:800;color:#166534;text-align:right;">+ ${escapeHtml(amountFormatted)}</td>
            </tr>
            ${
              prevFormatted
                ? `<tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Previous Balance</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#475569;text-align:right;">${escapeHtml(prevFormatted)}</td>
            </tr>`
                : ''
            }
            ${
              newFormatted
                ? `<tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:12px 14px;font-size:13px;font-weight:700;color:#0f172a;">New Verified Balance</td>
              <td style="padding:12px 14px;font-size:15px;font-weight:800;color:#ea580c;text-align:right;">${escapeHtml(newFormatted)}</td>
            </tr>`
                : ''
            }
            ${
              params.reference
                ? `<tr>
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Reference</td>
              <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#334155;text-align:right;">${escapeHtml(params.reference)}</td>
            </tr>`
                : ''
            }
          </table>

          <div style="margin-top:20px;">
            <a href="https://bemserp.work/wallet/funding" style="display:inline-block;background:#ea580c;color:#ffffff;font-weight:700;font-size:13px;padding:11px 18px;border-radius:10px;text-decoration:none;">Open Wallet Funding Dashboard →</a>
          </div>
        </div>
      </div>
    </div>`;

    let sentCount = 0;
    for (const email of emails) {
      const res = await sendEmail({
        to: email,
        subject: title,
        html,
        text: `${title}\n\n${bodyText}\n\nDashboard: https://bemserp.work/wallet/funding`,
        eventType: 'MONNIFY_WALLET_FUNDED',
      });
      if (res.success) sentCount++;
    }

    return { success: true, notifications: executives.length, emailsSent: sentCount };
  } catch (err) {
    console.warn('[Monnify Funding Notify] Failed:', err);
    return { success: false };
  }
}
