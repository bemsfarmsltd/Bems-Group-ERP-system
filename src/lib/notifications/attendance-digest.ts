import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { queryDailyAttendanceRoster } from '@/lib/services/attendance-roster';
import { getChannelConfigFromMatrix, getNotificationPolicyMatrix } from '@/lib/notifications/policy-matrix';
import type { AuthenticatedEmployee } from '@/lib/auth';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusBadge(status: string): string {
  const s = status.toUpperCase();
  if (s === 'PRESENT' || s === 'ON_TIME') {
    return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#dcfce7;color:#166534;">ON TIME</span>';
  }
  if (s === 'LATE') {
    return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#fef3c7;color:#92400e;">LATE</span>';
  }
  if (s === 'OFF_DAY' || s === 'EXCUSED') {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#f1f5f9;color:#475569;">${escapeHtml(s)}</span>`;
  }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#fee2e2;color:#991b1b;">${escapeHtml(s || 'ABSENT')}</span>`;
}

export interface SendDailyAttendanceDigestParams {
  actor?: Pick<AuthenticatedEmployee, 'id' | 'role' | 'legalName' | 'workEmail'>;
  date?: string | null;
  subsidiaryId?: string | null;
  recipients?: string[];
}

export async function sendDailyAttendanceDigestEmail(params: SendDailyAttendanceDigestParams = {}) {
  let actor = params.actor;
  if (!actor) {
    const exec = await prisma.employee.findFirst({
      where: { status: 'ACTIVE', role: { in: ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'] } },
      select: { id: true, role: true, legalName: true, workEmail: true },
    });
    if (!exec) {
      throw new Error('No active executive actor found to generate attendance digest.');
    }
    actor = exec as Pick<AuthenticatedEmployee, 'id' | 'role' | 'legalName' | 'workEmail'>;
  }

  const data = await queryDailyAttendanceRoster(actor, {
    date: params.date || null,
    subsidiaryId: params.subsidiaryId || null,
    redactSensitivePins: true,
  });

  let targetEmails: string[] = [];
  if (params.recipients && params.recipients.length > 0) {
    targetEmails = params.recipients.map((e) => e.trim()).filter(Boolean);
  } else {
    const [execs, matrix] = await Promise.all([
      prisma.employee.findMany({
        where: { status: 'ACTIVE', approvalStatus: 'APPROVED', role: { in: ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'CUSTOM_ADMIN'] } },
        select: { id: true, workEmail: true, role: true, customAdminProfileId: true },
      }),
      getNotificationPolicyMatrix(prisma),
    ]);
    targetEmails = execs
      .filter((e) => getChannelConfigFromMatrix(matrix, e.role, e.customAdminProfileId, 'ATTENDANCE_DAILY_DIGEST').email)
      .map((e) => e.workEmail)
      .filter((e): e is string => Boolean(e && e.includes('@')));
  }

  const uniqueEmails = Array.from(new Set(targetEmails));
  if (uniqueEmails.length === 0) {
    return { success: false, date: data.targetDate, sentCount: 0, error: 'No enabled email recipients for ATTENDANCE_DAILY_DIGEST.' };
  }

  const statusRank: Record<string, number> = {
    LATE: 1,
    ON_TIME: 2,
    PRESENT: 2,
    ABSENT: 3,
    OFF_DAY: 4,
  };

  const sortedRoster = [...data.roster].sort((a, b) => {
    const ra = statusRank[String(a.morningStatus).toUpperCase()] ?? 5;
    const rb = statusRank[String(b.morningStatus).toUpperCase()] ?? 5;
    if (ra !== rb) return ra - rb;
    return a.legalName.localeCompare(b.legalName);
  });

  const rowsHtml = sortedRoster
    .map(
      (r) => `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:10px 12px;font-size:13px;color:#0f172a;font-weight:600;">
          ${escapeHtml(r.legalName)}<br/>
          <span style="font-size:11px;color:#64748b;font-weight:400;">${escapeHtml(r.employeeNumber || '')}</span>
        </td>
        <td style="padding:10px 12px;font-size:12px;color:#334155;">${escapeHtml(r.subsidiary?.shortCode || r.subsidiary?.legalName || '-')}</td>
        <td style="padding:10px 12px;">${statusBadge(String(r.morningStatus || 'ABSENT'))}</td>
        <td style="padding:10px 12px;font-size:12px;color:#0f172a;">${escapeHtml(r.checkInTimeStr || '—')}</td>
        <td style="padding:10px 12px;font-size:12px;color:#0f172a;">${escapeHtml(r.checkOutTimeStr || '—')}</td>
        <td style="padding:10px 12px;font-size:12px;color:#475569;">${escapeHtml(r.stationName || '—')}</td>
      </tr>`
    )
    .join('');

  const { summary } = data;
  const subject = `BEMS Daily Attendance Report — ${data.targetDate} (${summary.attendanceRate}% Present)`;

  const html = `
  <div style="background:#f8fafc;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <div style="max-width:780px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;background:#ffffff;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ea580c;">BEMS Group · Daily Attendance Digest</div>
        <h1 style="margin:6px 0 0;font-size:20px;font-weight:800;color:#0f172a;">Attendance Summary for ${escapeHtml(data.targetDate)}</h1>
      </div>

      <div style="padding:20px 24px;display:flex;gap:12px;flex-wrap:wrap;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <div style="flex:1;min-width:110px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
          <div style="font-size:11px;color:#64748b;font-weight:600;">Total Staff</div>
          <div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:4px;">${summary.totalStaff}</div>
        </div>
        <div style="flex:1;min-width:110px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
          <div style="font-size:11px;color:#166534;font-weight:600;">On Time</div>
          <div style="font-size:20px;font-weight:800;color:#166534;margin-top:4px;">${summary.onTimeMorning}</div>
        </div>
        <div style="flex:1;min-width:110px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
          <div style="font-size:11px;color:#92400e;font-weight:600;">Late</div>
          <div style="font-size:20px;font-weight:800;color:#92400e;margin-top:4px;">${summary.lateMorning}</div>
        </div>
        <div style="flex:1;min-width:110px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
          <div style="font-size:11px;color:#991b1b;font-weight:600;">Absent</div>
          <div style="font-size:20px;font-weight:800;color:#991b1b;margin-top:4px;">${summary.absent}</div>
        </div>
        <div style="flex:1;min-width:110px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
          <div style="font-size:11px;color:#ea580c;font-weight:600;">Rate</div>
          <div style="font-size:20px;font-weight:800;color:#ea580c;margin-top:4px;">${summary.attendanceRate}%</div>
        </div>
      </div>

      <div style="padding:16px 24px;">
        <table style="width:100%;border-collapse:collapse;text-align:left;">
          <thead>
            <tr style="border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;color:#64748b;">
              <th style="padding:8px 12px;">Employee</th>
              <th style="padding:8px 12px;">Subsidiary</th>
              <th style="padding:8px 12px;">Status</th>
              <th style="padding:8px 12px;">Clock In</th>
              <th style="padding:8px 12px;">Clock Out</th>
              <th style="padding:8px 12px;">Station</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="6" style="padding:16px;text-align:center;color:#64748b;">No active staff records found for this date.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div style="padding:14px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b;">
        View live attendance anytime at <a href="https://bemserp.work/attendance" style="color:#ea580c;font-weight:600;text-decoration:none;">bemserp.work/attendance</a>.
      </div>
    </div>
  </div>`;

  const text = [
    `BEMS Daily Attendance Report (${data.targetDate})`,
    `Total: ${summary.totalStaff} | On Time: ${summary.onTimeMorning} | Late: ${summary.lateMorning} | Absent: ${summary.absent} | Rate: ${summary.attendanceRate}%`,
    '',
    ...sortedRoster.map(
      (r) =>
        `${r.legalName} (${r.employeeNumber}) | ${r.subsidiary?.shortCode || '-'} | ${r.morningStatus} | In: ${r.checkInTimeStr || '-'} | Out: ${r.checkOutTimeStr || '-'}`
    ),
  ].join('\n');

  let sentCount = 0;
  const errors: string[] = [];
  for (const email of uniqueEmails) {
    const res = await sendEmail({
      to: email,
      subject,
      html,
      text,
      eventType: 'DAILY_ATTENDANCE_DIGEST',
    });
    if (res.success) {
      sentCount++;
    } else {
      errors.push(`${email}: ${res.error || 'send failed'}`);
    }
  }

  return {
    success: sentCount > 0,
    date: data.targetDate,
    sentCount,
    recipients: uniqueEmails,
    summary,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
