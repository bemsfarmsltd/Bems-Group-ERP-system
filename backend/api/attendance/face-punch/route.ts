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
    const mode = typeof body?.mode === 'string' ? body.mode.toUpperCase() : 'PUNCH';
    const expectedEmployeeId = typeof body?.expectedEmployeeId === 'string' ? body.expectedEmployeeId.trim() : '';
    const livenessVerified = body?.livenessVerified === true;
    const livenessProof = body?.livenessProof as
      | {
          method?: string;
          // MediaPipe Blink proof
          startBlink?: number;
          peakBlinkLeft?: number;
          peakBlinkRight?: number;
          blinkDelta?: number;
          endBlink?: number;
          // MediaPipe Jaw Cycle proof
          startJaw?: number;
          peakJaw?: number;
          openDelta?: number;
          endJaw?: number;
          closeDelta?: number;
          // MediaPipe Nod (Down & Up) proof
          startPitch?: number;
          peakPitchDown?: number;
          nodDownDelta?: number;
          nodReturnDelta?: number;
          // MediaPipe Head Turn (Left & Right) proof
          minYaw?: number;
          maxYaw?: number;
          yawSweep?: number;
          // Neural PAD & Flash metadata
          neuralReady?: boolean;
          antispoofScore?: number;
          livenessScore?: number;
          flashReflectionDelta?: number;
          framesAnalyzed?: number;
        }
      | undefined;
    const requestedAction = typeof body?.action === 'string' ? body.action.toUpperCase() : 'AUTO';
    const requestedStationCode = typeof body?.stationCode === 'string' ? body.stationCode.trim() : '';

    if (mode !== 'IDENTIFY_ONLY') {
      // Strict Multi-Layer Anti-Spoofing Validation powered by Google MediaPipe 478-Point 3D Neural Blendshapes & 3D Pose:
      // Accepts ONLY genuine dynamic interval challenges (BLINK, JAW_CYCLE, NOD, HEAD_TURN) + Neural PAD CNN.
      const validMediaPipeBlink =
        livenessProof?.method === 'MEDIAPIPE_BLINK' &&
        Number(livenessProof?.startBlink ?? 1) <= 0.24 &&
        Number(livenessProof?.peakBlinkLeft ?? 0) >= 0.44 &&
        Number(livenessProof?.peakBlinkRight ?? 0) >= 0.44 &&
        Number(livenessProof?.blinkDelta ?? 0) >= 0.26 &&
        Number(livenessProof?.endBlink ?? 1) <= 0.22 &&
        Number(livenessProof?.framesAnalyzed ?? 0) >= 3;

      const validMediaPipeJawCycle =
        livenessProof?.method === 'MEDIAPIPE_JAW_CYCLE' &&
        Number(livenessProof?.startJaw ?? 1) <= 0.14 &&
        Number(livenessProof?.peakJaw ?? 0) >= 0.28 &&
        Number(livenessProof?.openDelta ?? 0) >= 0.20 &&
        Number(livenessProof?.endJaw ?? 1) <= 0.12 &&
        Number(livenessProof?.closeDelta ?? 0) >= 0.16 &&
        Number(livenessProof?.framesAnalyzed ?? 0) >= 3;

      const validMediaPipeNod =
        livenessProof?.method === 'MEDIAPIPE_NOD' &&
        Number(livenessProof?.nodDownDelta ?? 0) >= 0.12 &&
        Number(livenessProof?.nodReturnDelta ?? 0) >= 0.08 &&
        Number(livenessProof?.framesAnalyzed ?? 0) >= 4;

      const validMediaPipeHeadTurn =
        livenessProof?.method === 'MEDIAPIPE_HEAD_TURN' &&
        Number(livenessProof?.minYaw ?? 0) <= -0.22 &&
        Number(livenessProof?.maxYaw ?? 0) >= 0.22 &&
        Number(livenessProof?.yawSweep ?? 0) >= 0.48 &&
        Number(livenessProof?.framesAnalyzed ?? 0) >= 4;

      const isPoseChallenge = validMediaPipeNod || validMediaPipeHeadTurn;
      const neuralReady = livenessProof?.neuralReady === true;
      const antispoofScore = Number(livenessProof?.antispoofScore ?? 0);
      const livenessScore = Number(livenessProof?.livenessScore ?? 0);
      // Pose challenges require slightly stricter Neural PAD CNN pass to keep tilted phone screens blocked
      const neuralPadPassed = !neuralReady
        ? true
        : isPoseChallenge
        ? antispoofScore >= 0.46 || livenessScore >= 0.48
        : antispoofScore >= 0.38 || livenessScore >= 0.40;

      if (
        !livenessVerified ||
        (!validMediaPipeBlink && !validMediaPipeJawCycle && !validMediaPipeNod && !validMediaPipeHeadTurn) ||
        !neuralPadPassed
      ) {
        return NextResponse.json(
          {
            error: !neuralPadPassed
              ? 'Anti-Spoofing Guard: Phone screen or photo detected. Please step up to the kiosk in person.'
              : 'Liveness Check Incomplete: Please follow the on-screen step calmly in person.',
            spoofBlocked: true,
          },
          { status: 403 }
        );
      }
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
      if (mode === 'IDENTIFY_ONLY') {
        return NextResponse.json({
          recognized: false,
          confidencePercent: matchResult.confidencePercent,
          reason:
            matchResult.reason ||
            'Face not registered in BEMS. Please enroll your Face ID on the Staff App first.',
        });
      }
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

    // Prevent face-swapping between Stage 1 (Identify) and Stage 2 (Liveness Punch)
    if (mode !== 'IDENTIFY_ONLY' && expectedEmployeeId && matchResult.employeeId !== expectedEmployeeId) {
      return NextResponse.json(
        {
          error: 'Identity mismatch between face lock and liveness verification. Please try again in person.',
          spoofBlocked: true,
        },
        { status: 403 }
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

    // Stage 1 Read-Only Identification: confirms staff exists in BEMS before locking & starting Stage 2 liveness
    if (mode === 'IDENTIFY_ONLY') {
      const firstName = String(matched.legalName || 'Staff').trim().split(/\s+/)[0] || 'Staff';
      return NextResponse.json({
        recognized: true,
        employeeId: matched.id,
        firstName,
        employeeName: matched.legalName,
        confidencePercent: matchResult.confidencePercent,
      });
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
