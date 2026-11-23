import { prisma } from '@/lib/prisma';
import { sendGmdAttendanceAlert, getExecutiveRecipients } from '@/lib/email';
import { notifyAttendancePunch } from './events';

export interface NotifyGmdClockInParams {
  employee: {
    id: string;
    legalName: string;
    employeeNumber: string;
    workEmail?: string | null;
  };
  subsidiaryName: string;
  departmentName?: string;
  stationName: string;
  workDate: string;
  timeStr: string;
  status: 'PRESENT' | 'LATE' | string;
  deductionPercent?: number;
  method: 'KIOSK_PIN' | 'MOBILE_QR' | string;
}

/**
 * Dispatches both in-app SystemNotification records and Executive Email Alerts
 * to all active GMD and Super Admin users when a staff member clocks in.
 */
export async function notifyGmdStaffClockIn(params: NotifyGmdClockInParams) {
  try {
    const isLate = params.status === 'LATE';
    const statusLabel = isLate
      ? `LATE (${params.deductionPercent || 0}% deduction)`
      : 'ON TIME';

    const notifTitle = isLate
      ? `⚠️ Late Clock-In: ${params.employee.legalName}`
      : `🕒 Staff Clock-In: ${params.employee.legalName}`;

    const notifBody = `${params.employee.legalName} (${params.employee.employeeNumber}) clocked in at ${params.timeStr} at ${params.stationName} (${params.subsidiaryName}). Status: ${statusLabel}.`;

    // 1b. Dispatch personal in-app notification to the staff member
    await notifyAttendancePunch({
      employeeId: params.employee.id,
      stationName: params.stationName,
      timeStr: params.timeStr,
      isClockIn: true,
      status: params.status,
      minutesLate: isLate ? 15 : 0,
      deductionPercent: params.deductionPercent || 0,
    }).catch(err => console.error('[Attendance Notify] Staff notification failed:', err));

    // 1. Fetch active GMD and Super Admin accounts
    const executives = await prisma.employee.findMany({
      where: {
        role: { in: ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'] },
        status: 'ACTIVE',
      },
      select: { id: true, legalName: true, workEmail: true },
    });

    // 2. Insert in-app SystemNotification for each executive (Individual sign-in emails disabled;
    // executives receive the scheduled 12:00 PM WAT Daily Attendance Summary email instead)
    if (executives.length > 0) {
      await prisma.systemNotification.createMany({
        data: executives.map((exec) => ({
          employeeId: exec.id,
          kind: 'ATTENDANCE_CLOCK_IN',
          title: notifTitle,
          body: notifBody,
          linkUrl: '/attendance',
        })),
      });
    }
  } catch (error) {
    console.error('[Attendance Notify] Error notifying GMD of clock-in:', error);
  }
}

