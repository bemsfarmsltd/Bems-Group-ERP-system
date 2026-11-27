import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee } from '@/lib/auth';
import {
  ensureFaceAttendanceSchema,
  getFaceAttendanceModeConfig,
} from '@/lib/attendance/face-recognition';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const actor = await getAuthenticatedEmployee(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await ensureFaceAttendanceSchema();
    const [empRecord, profileRows, modeConfig] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: actor.id },
        select: { id: true, legalName: true, employeeNumber: true, role: true, isAttendanceExempt: true },
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
         FROM "EmployeeFaceProfile"
         WHERE "employeeId" = $1
         LIMIT 1`,
        actor.id
      ),
      getFaceAttendanceModeConfig(),
    ]);

    const profile = profileRows[0] || null;
    const isExecutiveRole =
      empRecord?.role === 'SYSTEM_ADMIN' ||
      empRecord?.role === 'SUPER_ADMIN' ||
      empRecord?.role === 'GMD';
    const isAttendanceTracked =
      Boolean(empRecord) &&
      !isExecutiveRole &&
      !empRecord?.isAttendanceExempt &&
      (empRecord?.role === 'STAFF' || empRecord?.role === 'CUSTOM_ADMIN');

    return NextResponse.json({
      enrolled: !isExecutiveRole && Boolean(profile),
      isExecutiveExempt: isExecutiveRole || Boolean(empRecord?.isAttendanceExempt),
      status: isExecutiveRole
        ? 'EXEMPT'
        : profile?.status === 'PENDING_APPROVAL'
        ? 'APPROVED'
        : profile?.status || 'NOT_ENROLLED',
      shouldPromptEnrollment:
        isAttendanceTracked && (!profile || profile.status === 'NOT_ENROLLED' || profile.status === 'REJECTED'),
      employee: empRecord
        ? {
            id: empRecord.id,
            legalName: empRecord.legalName,
            employeeNumber: empRecord.employeeNumber,
            role: empRecord.role,
          }
        : null,
      profile: profile
        ? {
            id: profile.id,
            status: profile.status,
            sampleCount: profile.sampleCount,
            livenessVerified: profile.livenessVerified,
            referencePhotoUrl: profile.referencePhotoUrl,
            enrolledAt: profile.enrolledAt,
            approvedByName: profile.approvedByName,
            approvedAt: profile.approvedAt,
            rejectionReason: profile.rejectionReason,
            updatedAt: profile.updatedAt,
          }
        : null,
      attendanceMode: modeConfig.globalMode,
      requireHrApproval: modeConfig.requireHrApproval,
    });
  } catch (error: any) {
    console.error('[attendance/face/profile] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load face profile.' },
      { status: 500 }
    );
  }
}
