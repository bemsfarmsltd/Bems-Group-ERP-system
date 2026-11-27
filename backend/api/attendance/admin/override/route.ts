import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { executeDashboardCommand } from '@/lib/staged-actions';
import { serializeAttendanceRecord } from '@/lib/attendance/token';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) return NextResponse.json({ error: 'Sign in to override attendance.' }, { status: 401 });
    const body = await request.json();

    const excuseDecision = typeof body.excuseDecision === 'string' ? body.excuseDecision.toUpperCase() : '';
    if (excuseDecision === 'APPROVE' || excuseDecision === 'REJECT') {
      if (!hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'])) {
        return NextResponse.json({ error: 'Only GMD or Super Admin can approve or decline attendance excuses.' }, { status: 403 });
      }
      const employeeId = String(body.employeeId || '').trim();
      const workDate = String(body.workDate || '').trim();
      if (!employeeId || !workDate) {
        return NextResponse.json({ error: 'employeeId and workDate are required.' }, { status: 400 });
      }
      const reason =
        String(body.reason || '').trim() ||
        (excuseDecision === 'APPROVE'
          ? 'Executive approved staff attendance excuse and waived penalty.'
          : 'Executive declined staff attendance excuse request.');

      if (excuseDecision === 'REJECT') {
        const updated = await prisma.attendanceRecord.update({
          where: { employeeId_workDate: { employeeId, workDate } },
          data: {
            excuseStatus: 'REJECTED',
            overrideById: actor.id,
            overrideReason: reason,
          },
        });
        return NextResponse.json({
          success: true,
          message: 'Attendance excuse declined. Original attendance penalty remains active.',
          record: serializeAttendanceRecord(updated),
        });
      }

      // APPROVE: waive penalty & mark record EXCUSED + excuseStatus APPROVED
      const updated = await prisma.attendanceRecord.upsert({
        where: { employeeId_workDate: { employeeId, workDate } },
        update: {
          status: 'EXCUSED',
          excuseStatus: 'APPROVED',
          isManualOverride: true,
          overrideById: actor.id,
          overrideReason: reason,
          deductionPercent: 0,
          deductionMinor: BigInt(0),
          isDeductionApplied: false,
        },
        create: {
          employeeId,
          workDate,
          status: 'EXCUSED',
          excuseStatus: 'APPROVED',
          isManualOverride: true,
          overrideById: actor.id,
          overrideReason: reason,
          deductionPercent: 0,
          deductionMinor: BigInt(0),
          isDeductionApplied: false,
        },
      });
      return NextResponse.json({
        success: true,
        message: 'Attendance excuse approved and penalty waived (0.0%).',
        record: serializeAttendanceRecord(updated),
      });
    }

    if (String(body.reason || '').trim().length < 5) {
      return NextResponse.json({ error: 'Explain the attendance change.' }, { status: 400 });
    }
    const record = await executeDashboardCommand(actor, 'attendance_override', {
      action_type: 'EXCUSE_OVERRIDE',
      employee_id: body.employeeId,
      work_date: body.workDate,
      override_status: body.status || 'PRESENT',
      reason: body.reason,
      deduction_percent: body.deductionPercent,
    });
    return NextResponse.json({ success: true, record });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
