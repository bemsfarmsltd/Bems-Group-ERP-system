import { getAuthenticatedStation } from '@/lib/attendance/station-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLagosTime, serializeAttendanceRecord } from '@/lib/attendance/token';
import { notifyGmdStaffClockIn } from '@/lib/notifications/attendance';
import { sendStaffAttendanceDeductionEmail } from '@/lib/notifications/attendance-deduction-email';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { computeMonthlyDeductionMinor, getEmployeeMonthlyGrossMinor } from '@/lib/services/attendance-absence-sweeper';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`kiosk-punch:${clientIp}`, {
      maxAttempts: 12,
      windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many kiosk punch attempts. Please wait a minute before trying again.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const staffIdentifier = typeof body.staffIdentifier === 'string' ? body.staffIdentifier.trim() : '';
    const kioskPin = typeof body.kioskPin === 'string' ? body.kioskPin.trim() : '';
    const action = body.action === 'CHECK_OUT' ? 'CHECK_OUT' : 'CHECK_IN';
    const requestedStationCode = typeof body.stationCode === 'string' ? body.stationCode.trim() : '';

    let station = requestedStationCode
      ? await prisma.attendanceStation.findFirst({
          where: { status: 'ACTIVE', code: requestedStationCode },
          include: { organization: { select: { legalName: true } } },
        })
      : null;
    if (!station) {
      station = await getAuthenticatedStation(request);
    }
    if (!station) return NextResponse.json({ error: 'No active office attendance station configured.' }, { status: 404 });

    if (!staffIdentifier || !kioskPin || kioskPin.length < 4) {
      return NextResponse.json(
        { error: 'Please enter both your exact Staff ID (e.g. BEMS-001) and your 4-Digit Kiosk PIN.' },
        { status: 400 }
      );
    }

    const candidates = await prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        role: { in: ['STAFF','CUSTOM_ADMIN'] },
        kioskPin,
      },
      select: {
        id: true,
        employeeNumber: true,
        legalName: true,
        workEmail: true,
        avatarUrl: true,
        role: true,
        isOfflineStaff: true,
        kioskPin: true,
        assignments: {
          include: { subsidiary: true, department: true },
          take: 1,
        },
      },
    });

    const q = staffIdentifier.toLowerCase();
    const matched =
      candidates.find(
        (c) =>
          c.employeeNumber.toLowerCase() === q ||
          c.workEmail.toLowerCase() === q ||
          c.legalName.toLowerCase() === q
      ) ||
      candidates.find((c) => c.legalName.toLowerCase().includes(q));

    if (!matched) {
      return NextResponse.json(
        { error: 'Invalid Staff ID / Name or 4-Digit Kiosk PIN. Please verify with HR.' },
        { status: 401 }
      );
    }

    const now = new Date();
    const { workDate, currentTimeStr, hours, minutes } = getLagosTime(now);
    const minutesSinceMidnight = hours * 60 + minutes;

    const policy = await prisma.attendancePolicy.findUnique({ where: { organizationId: station.organizationId } });

    const existing = await prisma.attendanceRecord.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: matched.id,
          workDate,
        },
      },
    });

    if (action === 'CHECK_OUT') {
      if (!existing || !existing.checkInTime) {
        return NextResponse.json(
          { error: `${matched.legalName} has not checked in yet today (${workDate}).` },
          { status: 400 }
        );
      }

      if (existing.checkOutTime) {
        const existingOutStr = getLagosTime(existing.checkOutTime).currentTimeStr;
        return NextResponse.json({
          success: true,
          alreadyCheckedOut: true,
          action: 'CHECK_OUT',
          employeeName: matched.legalName,
          employeeNumber: matched.employeeNumber,
          timeStr: existingOutStr,
          message: `${matched.legalName} already checked out today at ${existingOutStr}.`,
          record: serializeAttendanceRecord(existing),
        });
      }

      const closingTime = policy?.closingTime || '17:00';
      const [cHour, cMin] = closingTime.split(':').map(Number);
      const closingMinutes = (Number.isFinite(cHour) ? cHour : 17) * 60 + (Number.isFinite(cMin) ? cMin : 0);
      if (minutesSinceMidnight < closingMinutes) {
        return NextResponse.json(
          {
            error: `Sign-out is locked until ${closingTime} (5:00 PM). ${matched.legalName} cannot check out early (current time: ${currentTimeStr}).`,
            lockedUntil: closingTime,
          },
          { status: 400 }
        );
      }

      const updated = await prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          checkOutTime: now,
          ...(station?.id && !existing.stationId ? { stationId: station.id } : {}),
        },
      });

      return NextResponse.json({
        success: true,
        action: 'CHECK_OUT',
        employeeId: matched.id,
        employeeName: matched.legalName,
        employeeNumber: matched.employeeNumber,
        avatarUrl: matched.avatarUrl || null,
        department: matched.assignments?.[0]?.department?.name || 'Operations',
        subsidiary: matched.assignments?.[0]?.subsidiary?.legalName || 'BEMS Group',
        stationName: station.name,
        stationCode: station.code,
        status: updated.status,
        timeStr: currentTimeStr,
        message: `Goodbye ${matched.legalName}! Checked out at ${currentTimeStr}.`,
        record: serializeAttendanceRecord(updated),
      });
    }

    if (existing && existing.checkInTime) {
      return NextResponse.json({
        success: true,
        alreadyCheckedIn: true,
        employeeName: matched.legalName,
        employeeNumber: matched.employeeNumber,
        timeStr: currentTimeStr,
        message: `${matched.legalName} (${matched.employeeNumber}) is already checked in for today (${workDate}).`,
        record: serializeAttendanceRecord(existing),
      });
    }

    const resumptionTime = policy?.resumptionTime || '08:00';
    const graceMinutes = policy?.gracePeriodMinutes ?? 30;
    const [rH, rM] = resumptionTime.split(':').map(Number);
    const cutoffMinutes = rH * 60 + rM + graceMinutes;

    const isLate = minutesSinceMidnight > cutoffMinutes;
    const status = isLate ? 'LATE' : 'PRESENT';
    const deductionPercent = isLate ? (policy?.latenessDeductionPercent ?? 2.0) : 0.0;
    const monthlyGrossMinor = isLate ? await getEmployeeMonthlyGrossMinor(matched.id) : BigInt(0);
    const deductionMinor = isLate ? computeMonthlyDeductionMinor(monthlyGrossMinor, deductionPercent) : BigInt(0);

    const record = await prisma.attendanceRecord.upsert({
      where: {
        employeeId_workDate: {
          employeeId: matched.id,
          workDate,
        },
      },
      update: {
        checkInTime: now,
        status,
        deductionPercent,
        deductionMinor,
        isDeductionApplied: isLate && deductionPercent > 0,
        stationId: station?.id || null,
      },
      create: {
        employeeId: matched.id,
        workDate,
        checkInTime: now,
        status,
        deductionPercent,
        deductionMinor,
        isDeductionApplied: isLate && deductionPercent > 0,
        stationId: station?.id || null,
      },
    });

    // Dispatch async notification to GMD & Super Admin
    const subsidiaryName = matched.assignments?.[0]?.subsidiary?.legalName || 'BEMS Group';
    const departmentName = matched.assignments?.[0]?.department?.name;

    if (isLate && deductionPercent > 0) {
      void sendStaffAttendanceDeductionEmail({
        employeeId: matched.id,
        employeeName: matched.legalName,
        employeeNumber: matched.employeeNumber,
        workEmail: matched.workEmail,
        workDate,
        reasonType: 'LATE',
        checkInTimeStr: currentTimeStr,
        deductionPercent,
        deductionMinor,
        monthlyGrossMinor,
      }).catch(() => {});
    }

    notifyGmdStaffClockIn({
      employee: {
        id: matched.id,
        legalName: matched.legalName,
        employeeNumber: matched.employeeNumber,
        workEmail: matched.workEmail,
      },
      subsidiaryName,
      departmentName,
      stationName: station?.name || 'Office Attendance Kiosk',
      workDate,
      timeStr: currentTimeStr,
      status: record.status,
      deductionPercent: record.deductionPercent,
      method: 'KIOSK_PIN',
    }).catch((err) => console.error('[Kiosk Punch Route] Clock-in notification error:', err));

    return NextResponse.json({
      success: true,
      action: 'CHECK_IN',
      employeeId: matched.id,
      employeeName: matched.legalName,
      employeeNumber: matched.employeeNumber,
      avatarUrl: matched.avatarUrl || null,
      department: matched.assignments?.[0]?.department?.name || 'Operations',
      subsidiary: matched.assignments?.[0]?.subsidiary?.legalName || 'BEMS Group',
      stationName: station?.name || 'Office Attendance Kiosk',
      stationCode: station?.code || null,
      status,
      timeStr: currentTimeStr,
      message: isLate
        ? `Checked in ${matched.legalName} at ${currentTimeStr} (Marked LATE — after ${resumptionTime} + ${graceMinutes}m grace).`
        : `Welcome ${matched.legalName}! Checked in on time at ${currentTimeStr}.`,
      record: serializeAttendanceRecord(record),
    });
  } catch (error: any) {
    console.error('Error in POST /api/attendance/kiosk-punch:', error);
    return NextResponse.json({ error: error.message || 'Kiosk check-in failed.' }, { status: 500 });
  }
}

