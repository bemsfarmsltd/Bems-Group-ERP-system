import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, getHrAuthorizationScope, hasAnyRole } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import {
  ensureFaceAttendanceSchema,
  getFaceAttendanceModeConfig,
  saveFaceAttendanceModeConfig,
} from '@/lib/attendance/face-recognition';

export const dynamic = 'force-dynamic';

async function requireHrOrExec(request: Request) {
  const actor = await getAuthenticatedEmployee(request);
  if (!actor) return { actor: null, authorized: false };
  const isExec = hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN']);
  if (isExec) return { actor, authorized: true };
  const hrScope = await getHrAuthorizationScope(actor);
  return { actor, authorized: hrScope.authorized };
}

export async function GET(request: Request) {
  try {
    const { actor, authorized } = await requireHrOrExec(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!authorized) return NextResponse.json({ error: 'Forbidden: HR or Executive access required.' }, { status: 403 });

    await ensureFaceAttendanceSchema();
    const [modeConfig, stations, faceRows] = await Promise.all([
      getFaceAttendanceModeConfig(),
      prisma.attendanceStation.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, code: true, name: true, stateLocation: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.$queryRawUnsafe<
        Array<{
          id: string;
          employeeId: string;
          referencePhotoUrl: string | null;
          sampleCount: number;
          livenessVerified: boolean;
          status: string;
          enrolledAt: Date;
          approvedByName: string | null;
          approvedAt: Date | null;
          rejectionReason: string | null;
          updatedAt: Date;
        }>
      >(
        `SELECT "id", "employeeId", "referencePhotoUrl", "sampleCount", "livenessVerified", "status", "enrolledAt", "approvedByName", "approvedAt", "rejectionReason", "updatedAt"
         FROM "EmployeeFaceProfile"`
      ),
    ]);

    const employees = await prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['STAFF', 'CUSTOM_ADMIN'] },
        isAttendanceExempt: false,
      },
      select: {
        id: true,
        legalName: true,
        employeeNumber: true,
        workEmail: true,
        role: true,
        avatarUrl: true,
        assignments: {
          where: { status: 'ACTIVE' },
          take: 1,
          select: {
            subsidiary: { select: { id: true, legalName: true, code: true } },
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { legalName: 'asc' },
    });

    const faceMap = new Map(faceRows.map((r) => [r.employeeId, r]));

    let approvedCount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;
    let notEnrolledCount = 0;

    const registry = employees
      .map((emp) => {
        const fp = faceMap.get(emp.id) || null;
        const rawStatus = fp?.status || 'NOT_ENROLLED';
        const status = rawStatus === 'PENDING_APPROVAL' ? 'APPROVED' : rawStatus;
        if (status === 'APPROVED') approvedCount++;
        else if (status === 'REJECTED') rejectedCount++;
        else notEnrolledCount++;

        return {
          employeeId: emp.id,
          legalName: emp.legalName,
          employeeNumber: emp.employeeNumber,
          workEmail: emp.workEmail,
          role: emp.role,
          avatarUrl: emp.avatarUrl,
          subsidiaryName: emp.assignments[0]?.subsidiary?.legalName || 'BEMS Group',
          departmentName: emp.assignments[0]?.department?.name || 'Operations',
          faceStatus: status,
          referencePhotoUrl: fp?.referencePhotoUrl || null,
          sampleCount: fp?.sampleCount || 0,
          livenessVerified: fp?.livenessVerified ?? false,
          enrolledAt: fp?.enrolledAt || null,
          approvedByName: fp?.approvedByName || 'Instant Self-Service Activation',
          approvedAt: fp?.approvedAt || fp?.enrolledAt || null,
          rejectionReason: fp?.rejectionReason || null,
        };
      })
      .sort((a, b) => {
        const rank = (s: string) => (s === 'APPROVED' ? 0 : s === 'REJECTED' ? 1 : 2);
        const rDiff = rank(a.faceStatus) - rank(b.faceStatus);
        if (rDiff !== 0) return rDiff;
        if (a.faceStatus === 'APPROVED' && b.faceStatus === 'APPROVED') {
          const tA = a.enrolledAt ? new Date(a.enrolledAt).getTime() : 0;
          const tB = b.enrolledAt ? new Date(b.enrolledAt).getTime() : 0;
          if (tB !== tA) return tB - tA;
        }
        return a.legalName.localeCompare(b.legalName);
      });

    return NextResponse.json({
      modeConfig,
      stations: stations.map((s) => ({
        ...s,
        modeOverride: modeConfig.stationOverrides?.[s.code] || 'INHERIT',
        effectiveMode:
          modeConfig.stationOverrides?.[s.code] === 'QR' || modeConfig.stationOverrides?.[s.code] === 'FACE'
            ? modeConfig.stationOverrides[s.code]
            : modeConfig.globalMode,
      })),
      counts: {
        total: employees.length,
        approved: approvedCount,
        pending: pendingCount,
        rejected: rejectedCount,
        notEnrolled: notEnrolledCount,
      },
      registry,
    });
  } catch (error: any) {
    console.error('[attendance/face/admin GET] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load Face Recognition registry.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { actor, authorized } = await requireHrOrExec(request);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!authorized) return NextResponse.json({ error: 'Forbidden: HR or Executive access required.' }, { status: 403 });

    await ensureFaceAttendanceSchema();
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').toUpperCase();

    if (action === 'SET_MODE') {
      const updated = await saveFaceAttendanceModeConfig(
        {
          globalMode: body?.globalMode,
          requireHrApproval: body?.requireHrApproval,
          stationOverrides: body?.stationOverrides,
        },
        { id: actor.id, legalName: actor.legalName }
      );
      return NextResponse.json({
        success: true,
        modeConfig: updated,
        message: `Attendance system mode updated (Global: ${updated.globalMode === 'FACE' ? 'Face Recognition Kiosk' : 'QR Code + GPS'}).`,
      });
    }

    if (action === 'ENFORCE_ALL_UNENROLLED') {
      const [activeStaff, faceRows] = await Promise.all([
        prisma.employee.findMany({
          where: {
            status: 'ACTIVE',
            role: { in: ['STAFF', 'CUSTOM_ADMIN'] },
            isAttendanceExempt: false,
          },
          select: {
            id: true,
            legalName: true,
            employeeNumber: true,
            workEmail: true,
            isOfflineStaff: true,
          },
        }),
        prisma.$queryRawUnsafe<Array<{ employeeId: string; status: string }>>(
          `SELECT "employeeId", "status" FROM "EmployeeFaceProfile"`
        ),
      ]);

      const enrolledIds = new Set(
        faceRows
          .filter((r) => r.status === 'APPROVED' || r.status === 'PENDING_APPROVAL')
          .map((r) => r.employeeId)
      );

      const unenrolled = activeStaff.filter((s) => !enrolledIds.has(s.id));

      if (unenrolled.length > 0) {
        await prisma.systemNotification.createMany({
          data: unenrolled.map((s) => ({
            employeeId: s.id,
            kind: 'ALERT',
            title: 'MANDATORY: Enroll Your Kiosk Face ID Now',
            body: 'BEMS Management requires all active staff to register their Face ID immediately for reception kiosk attendance. Tap to enroll in 15 seconds.',
            linkUrl: '/attendance/face-enroll?autostart=1',
          })),
        });
      }

      let emailsSent = 0;
      const enrollUrl = 'https://bemserp.work/attendance/face-enroll?autostart=1';
      for (const s of unenrolled) {
        if (!s.workEmail || s.workEmail.endsWith('@bems.internal') || s.isOfflineStaff) continue;
        const res = await sendEmail({
          to: s.workEmail,
          subject: 'MANDATORY ACTION REQUIRED: Enroll Your BEMS Kiosk Face ID Now',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #f8fafc; border-radius: 16px;">
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px;">
                <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#fff7ed;border:1px solid #fed7aa;color:#ea580c;font-size:10.5px;font-weight:800;letter-spacing:0.06em;">
                  BEMS GROUP · MANDATORY ATTENDANCE COMPLIANCE
                </div>
                <h2 style="margin: 12px 0 10px; color: #0f172a; font-size: 20px;">Hello ${s.legalName},</h2>
                <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                  Management has enforced <strong>Mandatory Kiosk Face ID Enrollment</strong> for all BEMS Group staff (Staff ID: <strong>${s.employeeNumber}</strong>).
                </p>
                <p style="color: #475569; font-size: 13.5px; line-height: 1.6;">
                  You must complete your 15-second voice-guided Face ID registration immediately so the Office Reception Kiosk camera can identify and clock you in and out automatically. Attendance clock-in requires an active Face ID profile.
                </p>
                <div style="margin: 24px 0;">
                  <a href="${enrollUrl}" style="display: inline-block; background: #ea580c; color: #ffffff; text-decoration: none; font-weight: 800; font-size: 13.5px; padding: 12px 22px; border-radius: 10px;">
                    Enroll My Face ID Now (15 Seconds) →
                  </a>
                </div>
                <p style="color: #94a3b8; font-size: 11.5px; margin: 0;">
                  Or open your BEMS Staff App and tap "Enroll My Face ID Now" on the pop-up prompt: ${enrollUrl}
                </p>
              </div>
            </div>
          `,
          text: `Hello ${s.legalName}, BEMS Management has enforced Mandatory Kiosk Face ID Enrollment for all active staff. Please register your Face ID now (takes 15 seconds): ${enrollUrl}`,
          eventType: 'FACE_ID_ENFORCEMENT_ALERT',
        }).catch(() => ({ success: false }));
        if (res && res.success) emailsSent++;
      }

      return NextResponse.json({
        success: true,
        unenrolledCount: unenrolled.length,
        notificationsCreated: unenrolled.length,
        emailsSent,
        message: `Mandatory Face ID enforcement dispatched to ${unenrolled.length} unenrolled staff (${emailsSent} compliance emails sent + in-app pop-up alerts activated).`,
      });
    }

    const employeeId = typeof body?.employeeId === 'string' ? body.employeeId.trim() : '';
    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId is required.' }, { status: 400 });
    }

    const now = new Date();

    if (action === 'APPROVE') {
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeFaceProfile"
         SET "status" = 'APPROVED',
             "approvedById" = $1,
             "approvedByName" = $2,
             "approvedAt" = $3,
             "rejectionReason" = NULL,
             "updatedAt" = $3
         WHERE "employeeId" = $4`,
        actor.id,
        actor.legalName,
        now,
        employeeId
      );
      return NextResponse.json({
        success: true,
        message: 'Staff Face ID approved and unlocked for kiosk attendance.',
      });
    }

    if (action === 'REJECT') {
      const reason = typeof body?.reason === 'string' && body.reason.trim()
        ? body.reason.trim()
        : 'Please re-register your face in clear front lighting without hats or sunglasses.';
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeFaceProfile"
         SET "status" = 'REJECTED',
             "rejectionReason" = $1,
             "updatedAt" = $2
         WHERE "employeeId" = $3`,
        reason,
        now,
        employeeId
      );
      return NextResponse.json({
        success: true,
        message: 'Face enrollment rejected. Staff member can now re-enroll on the Staff Portal.',
      });
    }

    if (action === 'RESET') {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "EmployeeFaceProfile" WHERE "employeeId" = $1`,
        employeeId
      );
      return NextResponse.json({
        success: true,
        message: 'Face ID reset. Staff member can now register a new Face ID.',
      });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[attendance/face/admin POST] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update Face ID registry.' },
      { status: 500 }
    );
  }
}
