import { isStaffAccount } from '@/lib/portal-access';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { computeMonthlyDeductionMinor, getEmployeeMonthlyGrossMinor } from '@/lib/services/attendance-absence-sweeper';
import { sendStaffAttendanceDeductionEmail } from '@/lib/notifications/attendance-deduction-email';
import {
  calculateHaversineDistance,
  verifyStationQrToken,
  getLagosTime,
  serializeAttendanceRecord,
  extractClientIp,
  isStarlinkIpAllowed,
  validateCheckInTimeWindow,
} from '@/lib/attendance/token';
import {
  pinStationGpsFromPhoneScan,
  resolveEffectiveStationGates,
} from '@/lib/attendance/kiosk-sessions';
import { notifyGmdStaffClockIn } from '@/lib/notifications/attendance';
import { notifyAttendancePunch } from '@/lib/notifications/events';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized: Active BEMS session required to record attendance.' }, { status: 401 });
    }

    const body = await request.json();
    const { employeeId, qrToken, latitude, longitude, type = 'CHECK_IN' } = body;

    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId is required' }, { status: 400 });
    }

    // IDOR Protection: Staff can ONLY punch for themselves. Only GMD/System Admin can perform admin punch overrides.
    if (actor.id !== employeeId && !hasAnyRole(actor, ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'GMD'])) {
      return NextResponse.json({ error: 'Forbidden: You can only record attendance for your own account.' }, { status: 403 });
    }

    if (!qrToken) {
      return NextResponse.json({ error: 'Office QR Code scan is required' }, { status: 400 });
    }

    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json({ error: 'Device GPS coordinates are required' }, { status: 400 });
    }

    const latNum = Number(latitude);
    const lngNum = Number(longitude);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return NextResponse.json({ error: 'Coordinates must be valid numbers' }, { status: 400 });
    }

    // 1. Verify Employee
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        assignments: {
          include: { subsidiary: true, department: true },
          take: 1,
        },
        workSchedule: true,
      },
    });

    if (!employee || employee.status !== 'ACTIVE') {
      return NextResponse.json({ error: employee?.status === 'ON_LEAVE' ? 'Attendance cannot be recorded while you are on approved leave. Contact HR if your leave dates changed.' : 'Account is inactive or has been suspended. Please contact HR.' }, { status: 403 });
    }

    if (!isStaffAccount(employee.role)) {
      return NextResponse.json({ error: 'Attendance timekeeping is exclusively for general staff personnel.' }, { status: 403 });
    }

    // 2. Parse and Validate Station & Dynamic QR Token
    const parts = qrToken.split(':');
    if (parts.length !== 4 || parts[0] !== 'BEMSQR') {
      return NextResponse.json(
        { error: 'Invalid QR code. Please scan the dynamic QR code displayed on the office kiosk screen.' },
        { status: 400 }
      );
    }

    const stationCode = parts[1];
    const station = await prisma.attendanceStation.findUnique({
      where: { code: stationCode },
    });

    if (!station || station.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Attendance station ${stationCode} is inactive or invalid` },
        { status: 400 }
      );
    }

    // 3. Load Unified Group + Subsidiary Attendance Policy & Live Kiosk Router IP Gates
    const orgId = employee.assignments[0]?.subsidiaryId;
    const gates = await resolveEffectiveStationGates(station, orgId);
    const {
      requireGeofence,
      requireStarlink,
      powerOutageMode,
      awaitingPhoneGpsPin,
      starlinkIps,
      earliestCheckInTime,
      resumptionTime,
      closingTime,
      graceMinutes,
      latenessDeductionPercent,
    } = gates;

    // 4. Dual-Factor Check 1: Dynamic QR Cryptographic HMAC & Timestamp Verification
    const isQrValid = verifyStationQrToken(qrToken, station.code, station.activeSecret);
    if (!isQrValid) {
      return NextResponse.json(
        {
          error: 'QR code expired or invalid. Please point your camera at the active office kiosk screen.',
        },
        { status: 400 }
      );
    }

    // 5. Time & Shift Evaluation (Africa/Lagos)
    const now = new Date();
    const { workDate, currentTimeStr, dayOfWeek, hours, minutes } = getLagosTime(now);

    // Gate 1: Starlink / Office Router Wi-Fi Connection (honors Group/Entity OFF & Power Outage switches + Live Kiosk IP)
    const clientIp = extractClientIp(request);
    const starlinkCheck = isStarlinkIpAllowed(
      clientIp,
      starlinkIps,
      powerOutageMode,
      requireStarlink
    );

    if (!starlinkCheck.allowed) {
      return NextResponse.json(
        { error: starlinkCheck.reason },
        { status: 403 }
      );
    }

    // Auto-pin exact smartphone hardware GPS onto station when Kiosk is a Laptop awaiting first verified phone scan
    let effectiveStationLat = station.latitude;
    let effectiveStationLng = station.longitude;
    if (awaitingPhoneGpsPin) {
      await pinStationGpsFromPhoneScan({
        stationId: station.id,
        stationCode: station.code,
        latitude: latNum,
        longitude: lngNum,
      });
      effectiveStationLat = latNum;
      effectiveStationLng = lngNum;
    }

    // Dual-Factor Check 2: Geofence Verification (Honors policy bypass & outage buffer)
    const distanceMeters = calculateHaversineDistance(latNum, lngNum, effectiveStationLat, effectiveStationLng);
    const effectiveMaxRadius = powerOutageMode || !requireStarlink
      ? Math.max(station.radiusMeters, 250) // generous buffer for GPS drift when emergency/power mode is active
      : station.radiusMeters;

    if (requireGeofence && distanceMeters > effectiveMaxRadius) {
      return NextResponse.json(
        {
          error: `Geofence check failed: You are ${distanceMeters}m away from ${station.name}. You must be physically within ${effectiveMaxRadius}m to clock in.`,
          distanceMeters,
          allowedRadiusMeters: effectiveMaxRadius,
        },
        { status: 403 }
      );
    }

    // Check Weekly Off-Days
    const schedule = employee.workSchedule;
    const offDayIndices = (schedule?.weeklyOffDays || '0,6')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n));
    const isTodayOffDay = offDayIndices.includes(dayOfWeek);

    // Existing record for today
    const existing = await prisma.attendanceRecord.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: employee.id,
          workDate,
        },
      },
    });

    const isCheckIn = type.toUpperCase() === 'CHECK_IN';

    if (isCheckIn) {
      // Idempotency guard: never let a duplicate/late CHECK_IN scan overwrite an earlier check-in's status or deduction
      if (existing && existing.checkInTime) {
        const existingTimeStr = getLagosTime(existing.checkInTime).currentTimeStr;
        return NextResponse.json({
          success: true,
          alreadyCheckedIn: true,
          type: 'CHECK_IN',
          employeeName: employee.legalName,
          employeeNumber: employee.employeeNumber,
          workDate,
          time: existingTimeStr,
          status: existing.status,
          distanceMeters,
          stationName: station.name,
          deductionPercent: existing.deductionPercent,
          message: `You are already checked in for today (${workDate}) at ${existingTimeStr}.`,
          record: serializeAttendanceRecord(existing),
        });
      }

      // Gate 2: Morning Arrival Window Check (No check-in before 07:00 AM)
      const windowCheck = validateCheckInTimeWindow(currentTimeStr, earliestCheckInTime);
      if (!windowCheck.allowed) {
        return NextResponse.json(
          { error: windowCheck.reason },
          { status: 400 }
        );
      }

      // Calculate Lateness: 8:00 AM + 15 min grace = 8:15 AM
      const [rHour, rMin] = resumptionTime.split(':').map(Number);
      const graceThresholdMinutes = rHour * 60 + rMin + graceMinutes;
      const currentMinutes = hours * 60 + minutes;

      let status = 'PRESENT';
      let deductionPercent = 0.0;

      if (currentMinutes > graceThresholdMinutes) {
        status = 'LATE';
        deductionPercent = latenessDeductionPercent;
      }

      const monthlyGrossMinor = status === 'LATE' ? await getEmployeeMonthlyGrossMinor(employee.id) : BigInt(0);
      const deductionMinor = status === 'LATE' ? computeMonthlyDeductionMinor(monthlyGrossMinor, deductionPercent) : BigInt(0);

      // Upsert record
      const record = await prisma.attendanceRecord.upsert({
        where: {
          employeeId_workDate: {
            employeeId: employee.id,
            workDate,
          },
        },
        update: {
          stationId: station.id,
          checkInTime: existing?.checkInTime || now,
          checkInLat: latNum,
          checkInLng: lngNum,
          checkInDistanceM: distanceMeters,
          clientIp,
          status: existing?.checkInTime || existing?.isManualOverride ? existing.status : status,
          deductionPercent: existing?.checkInTime || existing?.isManualOverride ? existing.deductionPercent : deductionPercent,
          deductionMinor: existing?.checkInTime || existing?.isManualOverride ? existing.deductionMinor : deductionMinor,
          isDeductionApplied: existing?.checkInTime || existing?.isManualOverride ? existing.isDeductionApplied : (status === 'LATE' && deductionPercent > 0),
        },
        create: {
          employeeId: employee.id,
          stationId: station.id,
          workDate,
          checkInTime: now,
          checkInLat: latNum,
          checkInLng: lngNum,
          checkInDistanceM: distanceMeters,
          clientIp,
          status,
          deductionPercent,
          deductionMinor,
          isDeductionApplied: status === 'LATE' && deductionPercent > 0,
        },
      });

      // Dispatch async in-app notification to GMD & Super Admin (only on new check-in; individual sign-in emails disabled)
      if (!existing?.checkInTime) {
        const subsidiaryName = employee.assignments[0]?.subsidiary?.legalName || 'BEMS Group';
        const departmentName = employee.assignments[0]?.department?.name;

        notifyGmdStaffClockIn({
          employee: {
            id: employee.id,
            legalName: employee.legalName,
            employeeNumber: employee.employeeNumber,
            workEmail: employee.workEmail,
          },
          subsidiaryName,
          departmentName,
          stationName: station.name,
          workDate,
          timeStr: currentTimeStr,
          status: record.status,
          deductionPercent: record.deductionPercent,
          method: 'MOBILE_QR',
        }).catch((err) => console.error('[Punch Route] Clock-in notification error:', err));
      }

      return NextResponse.json({
        success: true,
        type: 'CHECK_IN',
        employeeName: employee.legalName,
        employeeNumber: employee.employeeNumber,
        workDate,
        time: currentTimeStr,
        status: record.status,
        distanceMeters,
        stationName: station.name,
        deductionPercent: record.deductionPercent,
        message:
          record.status === 'LATE'
            ? `Checked in at ${currentTimeStr} (LATE - Resumption was ${resumptionTime} with ${graceMinutes}m grace). Flagged for ${deductionPercent}% lateness deduction.`
            : `Checked in successfully at ${currentTimeStr} (ON TIME). Have a productive workday!`,
        record: serializeAttendanceRecord(record),
      });
    } else {
      // CHECK OUT
      if (!existing || !existing.checkInTime) {
        return NextResponse.json(
          { error: `You have not clocked in yet today (${workDate}). Please clock in first.` },
          { status: 400 }
        );
      }

      if (existing.checkOutTime) {
        const existingOutStr = getLagosTime(existing.checkOutTime).currentTimeStr;
        return NextResponse.json({
          success: true,
          alreadyCheckedOut: true,
          type: 'CHECK_OUT',
          employeeName: employee.legalName,
          employeeNumber: employee.employeeNumber,
          workDate,
          time: existingOutStr,
          status: existing.status,
          distanceMeters,
          stationName: station.name,
          message: `You already signed out today (${workDate}) at ${existingOutStr}.`,
          record: serializeAttendanceRecord(existing),
        });
      }

      const [cHour, cMin] = closingTime.split(':').map(Number);
      const closingMinutes = (Number.isFinite(cHour) ? cHour : 17) * 60 + (Number.isFinite(cMin) ? cMin : 0);
      const currentMinutes = hours * 60 + minutes;
      if (currentMinutes < closingMinutes) {
        return NextResponse.json(
          {
            error: `Sign-out is locked until ${closingTime} (5:00 PM). You cannot clock out early (current time: ${currentTimeStr}).`,
            lockedUntil: closingTime,
          },
          { status: 400 }
        );
      }

      const isEarly = currentMinutes < closingMinutes;

      const record = await prisma.attendanceRecord.upsert({
        where: {
          employeeId_workDate: {
            employeeId: employee.id,
            workDate,
          },
        },
        update: {
          stationId: station.id,
          checkOutTime: now,
          checkOutLat: latNum,
          checkOutLng: lngNum,
          checkOutDistanceM: distanceMeters,
          clientIp,
        },
        create: {
          employeeId: employee.id,
          stationId: station.id,
          workDate,
          checkOutTime: now,
          checkOutLat: latNum,
          checkOutLng: lngNum,
          checkOutDistanceM: distanceMeters,
          clientIp,
          status: isEarly ? 'HALF_DAY' : 'PRESENT',
        },
      });

      // Dispatch check-out confirmation to employee
      notifyAttendancePunch({
        employeeId: employee.id,
        subsidiaryId: employee.assignments[0]?.subsidiaryId,
        stationName: station.name,
        timeStr: currentTimeStr,
        isClockIn: false,
        status: record.status,
        recordId: record.id,
      }).catch(err => console.error('[Punch Route] Clock-out notification error:', err));

      return NextResponse.json({
        success: true,
        type: 'CHECK_OUT',
        employeeName: employee.legalName,
        employeeNumber: employee.employeeNumber,
        workDate,
        time: currentTimeStr,
        status: record.status,
        distanceMeters,
        stationName: station.name,
        message: isEarly
          ? `Checked out at ${currentTimeStr} (Closing time is ${closingTime}). Have a good evening!`
          : `Checked out successfully at ${currentTimeStr}. Workday completed!`,
        record: serializeAttendanceRecord(record),
      });
    }
  } catch (error: any) {
    console.error('Error recording attendance punch:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
