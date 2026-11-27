import { prisma } from '@/lib/prisma';
import { getLagosTime } from '@/lib/attendance/token';
import { sendStaffAttendanceDeductionEmail } from '@/lib/notifications/attendance-deduction-email';

export function computeMonthlyDeductionMinor(
  monthlyGrossMinor: number | bigint,
  deductionPercent: number
): bigint {
  const gross = typeof monthlyGrossMinor === 'bigint' ? Number(monthlyGrossMinor) : monthlyGrossMinor;
  if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(deductionPercent) || deductionPercent <= 0) {
    return BigInt(0);
  }
  const cappedPercent = Math.min(100, Math.max(0, deductionPercent));
  return BigInt(Math.round((gross * cappedPercent) / 100));
}

export async function getEmployeeMonthlyGrossMinor(employeeId: string): Promise<bigint> {
  const agreement = await prisma.employmentAgreement.findFirst({
    where: { employeeId, status: 'ACTIVE' },
    orderBy: { startDate: 'desc' },
    include: {
      compensations: {
        where: { effectiveTo: null },
        orderBy: [{ version: 'desc' }, { effectiveFrom: 'desc' }],
        take: 1,
      },
    },
  });
  return agreement?.compensations?.[0]?.grossMinor ?? BigInt(0);
}

export interface MarkDailyAbsencesParams {
  date?: string | null;
  dryRun?: boolean;
}

/**
 * End-of-day automated absence sweeper.
 * Marks active STAFF who have no AttendanceRecord for the target Lagos workday
 * as ABSENT with the configured absenceDeductionPercent (default 10% of monthly salary).
 * Never overwrites existing records or admin overrides, and skips exempt staff,
 * approved leave requests, and scheduled weekly off-days.
 */
export async function markDailyAbsences(params: MarkDailyAbsencesParams = {}) {
  const { workDate: todayStr } = getLagosTime();
  const targetDate = params.date?.trim() || todayStr;
  const dryRun = Boolean(params.dryRun);

  const [y, m, d] = targetDate.split('-').map(Number);
  const targetDateObj = new Date(y, m - 1, d);
  const dayOfWeek = targetDateObj.getDay();

  // Never mark absences on Sunday
  if (dayOfWeek === 0) {
    return {
      success: true,
      date: targetDate,
      dryRun,
      markedCount: 0,
      skippedSunday: true,
      marked: [] as Array<{ employeeId: string; legalName: string; deductionPercent: number; deductionMinor: string }>,
    };
  }

  const [employees, existingRecords, approvedLeaves, policies] = await Promise.all([
    prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['STAFF', 'CUSTOM_ADMIN'] },
        isAttendanceExempt: false,
      },
      include: {
        assignments: {
          where: { status: 'ACTIVE' },
          orderBy: [{ isPrimary: 'desc' }, { startsOn: 'desc' }],
          take: 1,
        },
        workSchedule: true,
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
      },
    }),
    prisma.attendanceRecord.findMany({
      where: { workDate: targetDate },
      select: { employeeId: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: targetDate },
        endDate: { gte: targetDate },
      },
      select: { employeeId: true },
    }),
    prisma.attendancePolicy.findMany(),
  ]);

  const recordedSet = new Set(existingRecords.map((r) => r.employeeId));
  const onLeaveSet = new Set(approvedLeaves.map((l) => l.employeeId));
  const policyByOrg = new Map(policies.map((p) => [p.organizationId, p]));

  const marked: Array<{
    employeeId: string;
    legalName: string;
    deductionPercent: number;
    deductionMinor: string;
  }> = [];

  for (const emp of employees) {
    // Skip if already clocked in, already marked absent, or admin-overridden
    if (recordedSet.has(emp.id)) continue;

    // Skip if on approved leave
    if (onLeaveSet.has(emp.id)) continue;

    // Skip if employee account was created after targetDate
    const createdDateStr = emp.createdAt.toISOString().slice(0, 10);
    if (createdDateStr > targetDate) continue;

    // Skip if employee's attendance exemption was only turned off after targetDate
    if (emp.attendanceTrackingStartDate && targetDate < emp.attendanceTrackingStartDate) continue;

    // Skip if scheduled weekly off-day
    const offDayIndices = (emp.workSchedule?.weeklyOffDays || '0,6')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    if (offDayIndices.includes(dayOfWeek)) continue;

    const orgId = emp.assignments?.[0]?.subsidiaryId || '';
    const policy = policyByOrg.get(orgId);
    const absencePercent = policy?.absenceDeductionPercent ?? 5.0;
    const grossMinor = emp.employmentAgreements?.[0]?.compensations?.[0]?.grossMinor ?? BigInt(0);
    const deductionMinor = computeMonthlyDeductionMinor(grossMinor, absencePercent);

    if (!dryRun) {
      await prisma.attendanceRecord.create({
        data: {
          employeeId: emp.id,
          workDate: targetDate,
          status: 'ABSENT',
          deductionPercent: absencePercent,
          deductionMinor,
          isDeductionApplied: absencePercent > 0,
          isManualOverride: false,
          excuseStatus: 'NONE',
        },
      });
      if (absencePercent > 0) {
        await sendStaffAttendanceDeductionEmail({
          employeeId: emp.id,
          employeeName: emp.legalName,
          employeeNumber: emp.employeeNumber,
          workEmail: emp.workEmail,
          workDate: targetDate,
          reasonType: 'ABSENT',
          deductionPercent: absencePercent,
          deductionMinor,
          monthlyGrossMinor: grossMinor,
        }).catch(() => {});
      }
    }

    marked.push({
      employeeId: emp.id,
      legalName: emp.legalName,
      deductionPercent: absencePercent,
      deductionMinor: deductionMinor.toString(),
    });
  }

  return {
    success: true,
    date: targetDate,
    dryRun,
    markedCount: marked.length,
    marked,
  };
}
