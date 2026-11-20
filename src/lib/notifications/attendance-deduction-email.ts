import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { canDeliverToEmployee } from '@/lib/notifications/policy-matrix';

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
    maximumFractionDigits: 0,
  }).format(Number(minor) / 100);
}

export interface StaffAttendanceDeductionEmailParams {
  employeeId: string;
  employeeName: string;
  employeeNumber?: string | null;
  workEmail?: string | null;
  workDate: string; // YYYY-MM-DD
  reasonType: 'LATE' | 'ABSENT';
  checkInTimeStr?: string | null;
  deductionPercent: number;
  deductionMinor: bigint | number;
  monthlyGrossMinor: bigint | number;
}

/**
 * Emails a staff member whenever an automated lateness (2%) or absence (5%)
 * attendance deduction is applied, showing exact deduction and remaining monthly salary.
 */
export async function sendStaffAttendanceDeductionEmail(params: StaffAttendanceDeductionEmailParams) {
  try {
    const eventKey = params.reasonType === 'ABSENT' ? 'ATTENDANCE_ABSENCE_SWEEP' : 'ATTENDANCE_CLOCK_IN';
    const emailAllowed = await canDeliverToEmployee(params.employeeId, eventKey, 'email');
    if (!emailAllowed) {
      return { success: false, skipped: true };
    }
    const email = params.workEmail?.trim();
    if (!email || !email.includes('@') || email.toLowerCase().endsWith('@bems.internal')) {
      return { success: false, skipped: true };
    }

    const monthPrefix = params.workDate.slice(0, 7);
    const grossMinor = Number(params.monthlyGrossMinor || 0);
    const todayDedMinor = Number(params.deductionMinor || 0);

    const monthRecords = await prisma.attendanceRecord.findMany({
      where: {
        employeeId: params.employeeId,
        workDate: { startsWith: monthPrefix },
      },
      select: {
        deductionPercent: true,
        excuseStatus: true,
      },
    });

    const mtdPercent = Math.min(
      100,
      monthRecords.reduce((sum, r) => {
        if (r.excuseStatus === 'APPROVED') return sum;
        return sum + (r.deductionPercent > 0 ? r.deductionPercent : 0);
      }, 0)
    );
    const mtdDeductionMinor = Math.round((grossMinor * mtdPercent) / 100);
    const remainingSalaryMinor = Math.max(0, grossMinor - mtdDeductionMinor);

    const isLate = params.reasonType === 'LATE';
    const title = isLate ? 'Late Arrival Deduction Notice' : 'Unexcused Absence Deduction Notice';
    const badgeColor = isLate ? '#92400e' : '#991b1b';
    const badgeBg = isLate ? '#fef3c7' : '#fee2e2';
    const badgeText = isLate ? `LATE ARRIVAL (${params.deductionPercent}%)` : `ABSENT (${params.deductionPercent}%)`;

    const subject = isLate
      ? `BEMS Attendance Notice: ${params.deductionPercent}% Late Deduction (${params.workDate})`
      : `BEMS Attendance Notice: ${params.deductionPercent}% Absence Deduction (${params.workDate})`;

    const detailLine = isLate
      ? `You clocked in late on <strong>${escapeHtml(params.workDate)}</strong>${params.checkInTimeStr ? ` at <strong>${escapeHtml(params.checkInTimeStr)} WAT</strong>` : ''}.`
      : `No attendance clock-in was recorded for you on <strong>${escapeHtml(params.workDate)}</strong>.`;

    const html = `
    <div style="background:#f8fafc;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ea580c;">BEMS Group · Attendance &amp; Payroll</div>
          <h1 style="margin:6px 0 8px;font-size:19px;font-weight:800;color:#0f172a;">${title}</h1>
          <span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${badgeBg};color:${badgeColor};">${badgeText}</span>
        </div>

        <div style="padding:20px 24px;font-size:14px;line-height:1.6;color:#334155;">
          <p style="margin:0 0 12px;">Hello <strong>${escapeHtml(params.employeeName)}</strong>${params.employeeNumber ? ` (${escapeHtml(params.employeeNumber)})` : ''},</p>
          <p style="margin:0 0 18px;">${detailLine} Per BEMS attendance policy, an automatic salary deduction has been recorded.</p>

          <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Date</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${escapeHtml(params.workDate)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Today's Deduction (${params.deductionPercent}%)</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:800;color:#991b1b;text-align:right;">- ${formatNaira(todayDedMinor)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Month-to-Date Deductions (${mtdPercent}%)</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#991b1b;text-align:right;">- ${formatNaira(mtdDeductionMinor)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Monthly Gross Salary</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#0f172a;text-align:right;">${formatNaira(grossMinor)}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;font-size:13px;font-weight:700;color:#0f172a;">Estimated Remaining Salary</td>
              <td style="padding:12px 14px;font-size:15px;font-weight:800;color:#ea580c;text-align:right;">${formatNaira(remainingSalaryMinor)}</td>
            </tr>
          </table>

          <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
            If you had an approved excuse, field assignment, or technical issue, you can review your deductions or submit an excuse for admin review on the
            <a href="https://bemserp.work/staff-app/index.html" style="color:#ea580c;font-weight:700;text-decoration:none;">BEMS Staff Web Portal</a>.
          </p>
        </div>
      </div>
    </div>`;

    const text = [
      `BEMS Attendance Deduction Notice (${params.workDate})`,
      `Hello ${params.employeeName},`,
      isLate
        ? `Late arrival recorded${params.checkInTimeStr ? ` at ${params.checkInTimeStr} WAT` : ''}. Deduction: ${params.deductionPercent}% (${formatNaira(todayDedMinor)}).`
        : `Unexcused absence recorded for ${params.workDate}. Deduction: ${params.deductionPercent}% (${formatNaira(todayDedMinor)}).`,
      `Month-to-Date Deductions (${mtdPercent}%): -${formatNaira(mtdDeductionMinor)}`,
      `Monthly Gross Salary: ${formatNaira(grossMinor)}`,
      `Estimated Remaining Salary: ${formatNaira(remainingSalaryMinor)}`,
      `Portal: https://bemserp.work/staff-app/index.html`,
    ].join('\n');

    return await sendEmail({
      to: email,
      subject,
      html,
      text,
      eventType: 'STAFF_ATTENDANCE_DEDUCTION',
    });
  } catch (err) {
    console.warn(`[Staff Deduction Email] Failed for ${params.employeeName}:`, err);
    return { success: false };
  }
}
