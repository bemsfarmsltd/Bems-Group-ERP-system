import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import {
  ensureFaceAttendanceSchema,
  getFaceAttendanceModeConfig,
  isValidFaceDescriptor,
} from '@/lib/attendance/face-recognition';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rl = await checkRateLimit(`face-enroll:${clientIp}`, {
      maxAttempts: 12,
      windowMs: 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many enrollment attempts. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    const actor = await getAuthenticatedEmployee(request);
    if (!actor) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const rawDescriptors = Array.isArray(body?.descriptors) ? body.descriptors : [];
    const livenessVerified = body?.livenessVerified === true;
    const referencePhotoUrl =
      typeof body?.referencePhotoUrl === 'string' && body.referencePhotoUrl.startsWith('data:image/')
        ? body.referencePhotoUrl.slice(0, 250000)
        : null;

    if (!livenessVerified) {
      return NextResponse.json(
        { error: 'Liveness check (blink & head turn verification) is required to register your face.' },
        { status: 400 }
      );
    }

    const validDescriptors = rawDescriptors.filter(isValidFaceDescriptor).slice(0, 5);
    if (validDescriptors.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 valid multi-angle face samples are required for accurate enrollment.' },
        { status: 400 }
      );
    }

    await ensureFaceAttendanceSchema();
    const existingRows = await prisma.$queryRawUnsafe<Array<{ id: string; status: string }>>(
      `SELECT "id", "status" FROM "EmployeeFaceProfile" WHERE "employeeId" = $1 LIMIT 1`,
      actor.id
    );
    const existing = existingRows[0] || null;

    if (existing && existing.status === 'APPROVED') {
      return NextResponse.json(
        {
          error:
            'Your Face ID is already approved and locked. Please ask HR or Super Admin to reset your Face ID if you need to re-enroll.',
        },
        { status: 403 }
      );
    }

    const modeConfig = await getFaceAttendanceModeConfig();
    const nextStatus = modeConfig.requireHrApproval ? 'PENDING_APPROVAL' : 'APPROVED';
    const descriptorsJson = JSON.stringify(validDescriptors);
    const now = new Date();

    if (existing) {
      await prisma.$executeRawUnsafe(
        `UPDATE "EmployeeFaceProfile"
         SET "descriptorsJson" = $1,
             "referencePhotoUrl" = $2,
             "sampleCount" = $3,
             "livenessVerified" = true,
             "status" = $4,
             "enrolledAt" = $5,
             "approvedById" = $6,
             "approvedByName" = $7,
             "approvedAt" = $8,
             "rejectionReason" = NULL,
             "updatedAt" = $5
         WHERE "employeeId" = $9`,
        descriptorsJson,
        referencePhotoUrl,
        validDescriptors.length,
        nextStatus,
        now,
        nextStatus === 'APPROVED' ? actor.id : null,
        nextStatus === 'APPROVED' ? 'Auto-Approved by Policy' : null,
        nextStatus === 'APPROVED' ? now : null,
        actor.id
      );
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "EmployeeFaceProfile"
         ("id", "employeeId", "descriptorsJson", "referencePhotoUrl", "sampleCount", "livenessVerified", "status", "enrolledAt", "approvedById", "approvedByName", "approvedAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $7)`,
        randomUUID(),
        actor.id,
        descriptorsJson,
        referencePhotoUrl,
        validDescriptors.length,
        nextStatus,
        now,
        nextStatus === 'APPROVED' ? actor.id : null,
        nextStatus === 'APPROVED' ? 'Auto-Approved by Policy' : null,
        nextStatus === 'APPROVED' ? now : null
      );
    }

    return NextResponse.json({
      success: true,
      status: nextStatus,
      sampleCount: validDescriptors.length,
      message:
        nextStatus === 'APPROVED'
          ? 'Face ID enrolled and active! You can now clock in at the Reception Kiosk camera.'
          : 'Face ID enrolled successfully and submitted for HR / Super Admin approval.',
    });
  } catch (error: any) {
    console.error('[attendance/face/enroll] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to enroll Face ID.' },
      { status: 500 }
    );
  }
}
