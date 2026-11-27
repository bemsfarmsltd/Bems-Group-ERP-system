import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { getLagosTime } from '@/lib/attendance/token';
import { getChannelConfigFromMatrix, getNotificationPolicyMatrix } from '@/lib/notifications/policy-matrix';

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

/**
 * Generates and dispatches the Weekly (every Sunday) Attendance Deduction & Salary Summary
 * to all active STAFF members via:
 *  1) In-app SystemNotification (kind: 'WEEKLY_DEDUCTION_SUMMARY') — triggers pop-up in Staff Web App
 *  2) Transactional Email via Resend (skipping @bems.internal offline placeholder emails)
 */
export async function sendWeeklyStaffDeductionSummaries() {
  const { workDate } = getLagosTime();
  const monthPrefix = workDate.slice(0, 7);

  const staffList = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      role: { in: ['STAFF', 'CUSTOM_ADMIN'] },
    },
    include: {
      assignments: {
        where: { status: 'ACTIVE' },
        orderBy: [{ isPrimary: 'desc' }, { startsOn: 'desc' }],
        take: 1,
      },
      employmentAgreements: {
        where: { status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
        take: 1,
        include: {
          compensations: {
            where: { effectiveTo: null },
            orderBy: [{ version: 'desc' }, { effectiveFrom: 'desc' }],
            take: 1,
          },
        },
      },
      attendanceRecords: {
        where: { workDate: { startsWith: monthPrefix } },
        select: {
          workDate: true,
          status: true,
          deductionPercent: true,
          excuseStatus: true,
        },
      },
    },
    orderBy: { legalName: 'asc' },
  });

  let notificationsCreated = 0;
  let emailsSent = 0;
  let emailsSkipped = 0;

  const matrix = await getNotificationPolicyMatrix(prisma);
  const staffChannelCfg = getChannelConfigFromMatrix(matrix, 'STAFF', null, 'ATTENDANCE_WEEKLY_SUMMARY');

  for (const emp of staffList) {
    const grossMinor = Number(emp.employmentAgreements?.[0]?.compensations?.[0]?.grossMinor ?? BigInt(0));
    const subsidiaryId = emp.assignments?.[0]?.subsidiaryId || null;

    let lateCount = 0;
    let absentCount = 0;
    let totalPercent = 0;

    for (const rec of emp.attendanceRecords) {
      if (rec.excuseStatus === 'APPROVED') continue;
      if (rec.status === 'LATE' && rec.deductionPercent > 0) lateCount++;
      if (rec.status === 'ABSENT' && rec.deductionPercent > 0) absentCount++;
      if (rec.deductionPercent > 0) totalPercent += rec.deductionPercent;
    }

    const cappedPercent = Math.min(100, Math.max(0, totalPercent));
    const totalDeductionMinor = Math.round((grossMinor * cappedPercent) / 100);
    const remainingSalaryMinor = Math.max(0, grossMinor - totalDeductionMinor);

    const hasDeductions = totalDeductionMinor > 0 || cappedPercent > 0;
    const notifTitle = hasDeductions
      ? `Weekly Deduction Summary (${monthPrefix}) — ${cappedPercent}%`
      : `Weekly Salary & Attendance Summary (${monthPrefix}) — Clear`;
    const notifBody = hasDeductions
      ? `Month-to-date (${monthPrefix}): ${lateCount} late day(s), ${absentCount} absent day(s). Total deductions: ${formatNaira(totalDeductionMinor)} (${cappedPercent}%). Estimated remaining salary: ${formatNaira(remainingSalaryMinor)} out of ${formatNaira(grossMinor)}.`
      : `Great job! You have ₦0 attendance deductions so far for ${monthPrefix}. Estimated remaining salary: ${formatNaira(remainingSalaryMinor)}.`;

    if (staffChannelCfg.inApp) {
      await prisma.systemNotification.create({
        data: {
          employeeId: emp.id,
          subsidiaryId,
          category: 'PAYROLL_DEDUCTIONS',
          priority: hasDeductions ? 'IMPORTANT' : 'INFORMATIONAL',
          kind: 'WEEKLY_DEDUCTION_SUMMARY',
          title: notifTitle,
          body: notifBody,
          actionLabel: 'View Deductions',
          actionUrl: '/deductions',
          metadata: {
            month: monthPrefix,
            asOfDate: workDate,
            grossMinor,
            deductionMinor: totalDeductionMinor,
            remainingMinor: remainingSalaryMinor,
            lateCount,
            absentCount,
            totalPercent: cappedPercent,
          },
        },
      });
      notificationsCreated++;
    }

    const email = emp.workEmail?.trim();
    if (!staffChannelCfg.email || !email || !email.includes('@') || email.toLowerCase().endsWith('@bems.internal')) {
      emailsSkipped++;
      continue;
    }

    const statusBg = hasDeductions ? '#fef3c7' : '#dcfce7';
    const statusColor = hasDeductions ? '#92400e' : '#166534';
    const statusText = hasDeductions
      ? `${cappedPercent}% MONTH-TO-DATE DEDUCTION`
      : '0% DEDUCTIONS — ALL CLEAR';

    const html = `
    <div style="background:#f8fafc;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ea580c;">BEMS Group · Weekly Deduction Summary</div>
          <h1 style="margin:6px 0 8px;font-size:19px;font-weight:800;color:#0f172a;">Your Attendance &amp; Deduction Status (${escapeHtml(monthPrefix)})</h1>
          <span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;background:${statusBg};color:${statusColor};">${statusText}</span>
        </div>

        <div style="padding:20px 24px;font-size:14px;line-height:1.6;color:#334155;">
          <p style="margin:0 0 14px;">Hello <strong>${escapeHtml(emp.legalName)}</strong> (${escapeHtml(emp.employeeNumber)}),</p>
          <p style="margin:0 0 18px;">Here is your weekly attendance deduction and salary summary as of <strong>${escapeHtml(workDate)}</strong>:</p>

          <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Monthly Gross Salary</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${formatNaira(grossMinor)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Late Arrivals (2% each)</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${lateCount} day(s)</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Unexcused Absences (5% each)</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${absentCount} day(s)</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:10px 14px;font-size:13px;color:#64748b;">Total Deductions (${cappedPercent}%)</td>
              <td style="padding:10px 14px;font-size:13px;font-weight:800;color:${hasDeductions ? '#991b1b' : '#166534'};text-align:right;">${hasDeductions ? `- ${formatNaira(totalDeductionMinor)}` : '₦0'}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;font-size:13px;font-weight:700;color:#0f172a;">Estimated Remaining Salary</td>
              <td style="padding:12px 14px;font-size:15px;font-weight:800;color:#ea580c;text-align:right;">${formatNaira(remainingSalaryMinor)}</td>
            </tr>
          </table>

          <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
            View full attendance details or submit an excuse on the
            <a href="https://bemserp.work/staff-app/index.html" style="color:#ea580c;font-weight:700;text-decoration:none;">BEMS Staff Web Portal</a>.
          </p>
        </div>
      </div>
    </div>`;

    const res = await sendEmail({
      to: email,
      subject: `BEMS Weekly Deduction Summary — ${monthPrefix} (${cappedPercent}% Deduction)`,
      html,
      text: `${notifTitle}\n\n${notifBody}\n\nPortal: https://bemserp.work/staff-app/index.html`,
      eventType: 'WEEKLY_DEDUCTION_SUMMARY',
    });
    if (res.success) emailsSent++;
  }

  return {
    success: true,
    month: monthPrefix,
    asOfDate: workDate,
    totalStaff: staffList.length,
    notificationsCreated,
    emailsSent,
    emailsSkipped,
  };
}
