import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedStation } from '@/lib/attendance/station-auth';
import { getLagosTime, serializeAttendanceRecord, validateCheckInTimeWindow } from '@/lib/attendance/token';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { computeMonthlyDeductionMinor, getEmployeeMonthlyGrossMinor } from '@/lib/services/attendance-absence-sweeper';
import { notifyGmdStaffClockIn } from '@/lib/notifications/attendance';
import {
  ensureFaceAttendanceSchema,
  FaceCandidateProfile,
  isValidFaceDescriptor,
  matchFaceDescriptorAgainstRoster,
} from '@/lib/attendance/face-recognition';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rl = await checkRateLimit(`face-punch:${clientIp}`, {
      maxAttempts: 25,
      windowMs: 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many face scan attempts. Please wait a few seconds and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const descriptor = body?.descriptor;
    const livenessVerified = body?.livenessVerified === true;
    const livenessProof = body?.livenessProof as
      | {
          method?: string;
          startMar?: number;
          peakMar?: number;
          marDelta?: number;
          startYaw?: number;
          peakYaw?: number;
          yawDelta?: number;
          framesAnalyzed?: number;
        }
      | undefined;
    const requestedAction = typeof body?.action === 'string' ? body.action.toUpperCase() : 'AUTO';
    const requestedStationCode = typeof body?.stationCode === 'string' ? body.stationCode.trim() : '';

    // Strict Active Challenge-Response Liveness Validation (impossible for static photos or phone screens)
    const validMouthChallenge =
      livenessProof?.method === 'CHALLENGE_MOUTH_OPEN' &&
      Number(livenessProof?.startMar ?? 1) <= 0.22 &&
      Number(livenessProof?.peakMar ?? 0) >= 0.34 &&
      Number(livenessProof?.marDelta ?? 0) >= 0.14;

    const validTurnLeftChallenge =
      livenessProof?.method === 'CHALLENGE_TURN_LEFT' &&
      Math.abs(Number(livenessProof?.startYaw ?? 1)) <= 0.18 &&
      Number(livenessProof?.peakYaw ?? 0) <= -0.22 &&
      Number(livenessProof?.yawDelta ?? 0) >= 0.16;

    const validTurnRightChallenge =
      livenessProof?.method === 'CHALLENGE_TURN_RIGHT' &&
      Math.abs(Number(livenessProof?.startYaw ?? 1)) <= 0.18 &&
      Number(livenessProof?.peakYaw ?? 0) >= 0.22 &&
      Number(livenessProof?.yawDelta ?? 0) >= 0.16;

    if (!livenessVerified || (!validMouthChallenge && !validTurnLeftChallenge && !validTurnRightChallenge)) {
      return NextResponse.json(
        {
          error:
            'Anti-Spoofing Challenge Failed: Photos and phone screens cannot clock in. Please step up in person and follow the on-screen liveness prompt.',
          spoofBlocked: true,
        },
        { status: 403 }
      );
    }

    if (!isValidFaceDescriptor(descriptor)) {
      return NextResponse.json(
        { error: 'Valid facial biometric vector is required. Please face the camera clearly.' },
        { status: 400 }
      );
    }

    let station = await getAuthenticatedStation(request);
    if (!station && requestedStationCode) {
      station = await prisma.attendanceStation.findFirst({
        where: { status: 'ACTIVE', code: requestedStationCode },
        include: { organization: { select: { legalName: true } } },
      });
    }
    if (!station) {
      return NextResponse.json(
        { error: 'Kiosk station is not unlocked. Enter the Kiosk Access Password first.' },
        { status: 401 }
      );
    }

    await ensureFaceAttendanceSchema();

    const approvedProfiles = await prisma.$queryRawUnsafe<
      Array<{ employeeId: string; descriptorsJson: string }>
    >(
      `SELECT fp."employeeId", fp."descriptorsJson"
       FROM "EmployeeFaceProfile" fp
       INNER JOIN "Employee" e ON e."id" = fp."employeeId"
       WHERE fp."status" IN ('APPROVED', 'PENDING_APPROVAL')
         AND e."status" = 'ACTIVE'
         AND e."isAttendanceExempt" = false
         AND e."role" IN ('STAFF', 'CUSTOM_ADMIN')`
    );

    if (approvedProfiles.length === 0) {
      return NextResponse.json(
        {
          error:
            'No approved staff Face IDs are registered yet. Staff should enroll their face on the Staff Portal and have HR approve it.',
        },
        { status: 404 }
      );
    }

    const candidates: FaceCandidateProfile[] = [];
    for (const row of approvedProfiles) {
      try {
        const parsed = JSON.parse(row.descriptorsJson);
        if (Array.isArray(parsed)) {
          candidates.push({ employeeId: row.employeeId, descriptors: parsed });
        }
      } catch {}
    }

    const matchResult = matchFaceDescriptorAgainstRoster(descriptor, candidates);
    if (!matchResult.matched || !matchResult.employeeId) {
      return NextResponse.json(
        {
          error:
            matchResult.reason ||
            'Face not recognized. Ensure your Face ID is enrolled and approved by HR, and look directly at the kiosk camera.',
          confidencePercent: matchResult.confidencePercent,
        },
        { status: 401 }
      );
    }

    const matched = await prisma.employee.findUnique({
      where: { id: matchResult.employeeId },
      select: {
        id: true,
        employeeNumber: true,
        legalName: true,
        workEmail: true,
        avatarUrl: true,
        role: true,
        assignments: {
          where: { status: 'ACTIVE' },
          include: { subsidiary: true, department: true },
          take: 1,
        },
      },
    });

    if (!matched) {
      return NextResponse.json({ error: 'Matched staff account not found.' }, { status: 404 });
    }

    const now = new Date();
    const { workDate, currentTimeStr, hours, minutes } = getLagosTime(now);
    const minutesSinceMidnight = hours * 60 + minutes;

    const policy =
      (await prisma.attendancePolicy.findUnique({ where: { organizationId: station.organizationId } })) ||
      (await prisma.attendancePolicy.findFirst());

    const earliestCheckInTime = policy?.earliestCheckInTime || '07:00';
    const resumptionTime = policy?.resumptionTime || '08:00';
    const closingTime = policy?.closingTime || '17:00';
    const graceMinutes = policy?.gracePeriodMinutes ?? 30;

    const existing = await prisma.attendanceRecord.findUnique({
      where: {
        employeeId_workDate: {
          employeeId: matched.id,
          workDate,
        },
      },
    });

    const [cHour, cMin] = closingTime.split(':').map(Number);
    const closingMinutes = (Number.isFinite(cHour) ? cHour : 17) * 60 + (Number.isFinite(cMin) ? cMin : 0);

    // Smart Auto-Mode:
    // - If employee has NOT checked in today -> CHECK_IN (unless it's already >= closingTime and they explicitly requested CHECK_OUT)
    // - If employee HAS already checked in today:
    //   - If current WAT time >= closingTime (17:00) -> automatically CHECK_OUT
    //   - If current WAT time < closingTime (17:00) -> inform them they are already clocked in and sign-out opens at closingTime
    const action: 'CHECK_IN' | 'CHECK_OUT' =
      requestedAction === 'CHECK_IN' || requestedAction === 'CHECK_OUT'
        ? (requestedAction as 'CHECK_IN' | 'CHECK_OUT')
        : existing && existing.checkInTime && minutesSinceMidnight >= closingMinutes
        ? 'CHECK_OUT'
        : 'CHECK_IN';

    if (action === 'CHECK_OUT') {
      if (!existing || !existing.checkInTime) {
        return NextResponse.json(
          {
            error: `Hello ${matched.legalName} — you have not checked in yet today (${workDate}).`,
            employeeName: matched.legalName,
            employeeNumber: matched.employeeNumber,
            avatarUrl: matched.avatarUrl || null,
            confidencePercent: matchResult.confidencePercent,
          },
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
          avatarUrl: matched.avatarUrl || null,
          confidencePercent: matchResult.confidencePercent,
          timeStr: existingOutStr,
          message: `${matched.legalName} already signed out today at ${existingOutStr}.`,
          record: serializeAttendanceRecord(existing),
        });
      }

      if (minutesSinceMidnight < closingMinutes) {
        return NextResponse.json(
          {
            error: `Sign-out is locked until ${closingTime} (5:00 PM). ${matched.legalName} cannot check out early (current time: ${currentTimeStr}).`,
            lockedUntil: closingTime,
            employeeName: matched.legalName,
            employeeNumber: matched.employeeNumber,
            avatarUrl: matched.avatarUrl || null,
            confidencePercent: matchResult.confidencePercent,
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
        confidencePercent: matchResult.confidencePercent,
        timeStr: currentTimeStr,
        message: `Goodbye ${matched.legalName}! Checked out via Face ID (${matchResult.confidencePercent}% match) at ${currentTimeStr}.`,
        record: serializeAttendanceRecord(updated),
      });
    }

    if (existing && existing.checkInTime) {
      const existingInStr = getLagosTime(existing.checkInTime).currentTimeStr;
      return NextResponse.json({
        success: true,
        alreadyCheckedIn: true,
        action: 'CHECK_IN',
        employeeId: matched.id,
        employeeName: matched.legalName,
        employeeNumber: matched.employeeNumber,
        avatarUrl: matched.avatarUrl || null,
        department: matched.assignments?.[0]?.department?.name || 'Operations',
        subsidiary: matched.assignments?.[0]?.subsidiary?.legalName || 'BEMS Group',
        stationName: station.name,
        stationCode: station.code,
        status: existing.status,
        confidencePercent: matchResult.confidencePercent,
        timeStr: existingInStr,
        message: `${matched.legalName} (${matched.employeeNumber}) is already clocked in for today at ${existingInStr}. Evening sign-out opens automatically at ${closingTime} (5:00 PM).`,
        record: serializeAttendanceRecord(existing),
      });
    }

    const windowCheck = validateCheckInTimeWindow(currentTimeStr, earliestCheckInTime);
    if (!windowCheck.allowed) {
      return NextResponse.json(
        {
          error: `Hello ${matched.legalName} — ${windowCheck.reason}`,
          employeeName: matched.legalName,
          employeeNumber: matched.employeeNumber,
          confidencePercent: matchResult.confidencePercent,
        },
        { status: 400 }
      );
    }

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
        clientIp,
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
        clientIp,
      },
    });

    const subsidiaryName = matched.assignments?.[0]?.subsidiary?.legalName || 'BEMS Group';
    const departmentName = matched.assignments?.[0]?.department?.name;

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
    }).catch((err) => console.error('[Face Punch Route] Clock-in notification error:', err));

    return NextResponse.json({
      success: true,
      action: 'CHECK_IN',
      employeeId: matched.id,
      employeeName: matched.legalName,
      employeeNumber: matched.employeeNumber,
      avatarUrl: matched.avatarUrl || null,
      department: departmentName || 'Operations',
      subsidiary: subsidiaryName,
      stationName: station?.name || 'Office Attendance Kiosk',
      stationCode: station?.code || null,
      status,
      confidencePercent: matchResult.confidencePercent,
      timeStr: currentTimeStr,
      message: isLate
        ? `Welcome ${matched.legalName}! Clocked in LATE via Face ID (${matchResult.confidencePercent}% match) at ${currentTimeStr}.`
        : `Welcome ${matched.legalName}! Clocked in ON TIME via Face ID (${matchResult.confidencePercent}% match) at ${currentTimeStr}.`,
      record: serializeAttendanceRecord(record),
    });
  } catch (error: any) {
    console.error('[attendance/face-punch] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process Face ID attendance punch.' },
      { status: 500 }
    );
  }
}
