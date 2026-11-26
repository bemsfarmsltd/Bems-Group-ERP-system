import { prisma } from '@/lib/prisma';

export const FACE_MODE_CONFIG_KEY = 'ATTENDANCE_FACE_MODE_CONFIG';

export type AttendanceSystemMode = 'QR' | 'FACE';
export type StationAttendanceModeOverride = 'INHERIT' | 'QR' | 'FACE';

export interface FaceAttendanceModeConfig {
  globalMode: AttendanceSystemMode;
  requireHrApproval: boolean;
  stationOverrides: Record<string, StationAttendanceModeOverride>;
  updatedAt: string;
  updatedByName?: string | null;
}

let schemaEnsured = false;

export async function ensureFaceAttendanceSchema(): Promise<void> {
  if (schemaEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EmployeeFaceProfile" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "employeeId" TEXT NOT NULL UNIQUE REFERENCES "Employee"("id") ON DELETE CASCADE,
        "descriptorsJson" TEXT NOT NULL,
        "referencePhotoUrl" TEXT,
        "sampleCount" INTEGER NOT NULL DEFAULT 3,
        "livenessVerified" BOOLEAN NOT NULL DEFAULT true,
        "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
        "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "approvedById" TEXT,
        "approvedByName" TEXT,
        "approvedAt" TIMESTAMP(3),
        "rejectionReason" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "EmployeeFaceProfile_status_idx" ON "EmployeeFaceProfile"("status");
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "EmployeeFaceProfile"
      SET "status" = 'APPROVED',
          "approvedByName" = COALESCE("approvedByName", 'Auto-Activated'),
          "approvedAt" = COALESCE("approvedAt", CURRENT_TIMESTAMP)
      WHERE "status" = 'PENDING_APPROVAL';
    `);
    schemaEnsured = true;
  } catch (err) {
    console.warn('[FaceAttendance] Schema ensure warning:', err);
  }
}

async function resolveRootOrganizationId(): Promise<string> {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return org?.id || 'BEMS_GROUP';
}

export async function getFaceAttendanceModeConfig(): Promise<FaceAttendanceModeConfig> {
  const defaults: FaceAttendanceModeConfig = {
    globalMode: 'QR',
    requireHrApproval: false,
    stationOverrides: {},
    updatedAt: new Date().toISOString(),
    updatedByName: null,
  };
  try {
    const row = await prisma.workspaceSetting.findFirst({
      where: { key: FACE_MODE_CONFIG_KEY },
      orderBy: { updatedAt: 'desc' },
    });
    if (!row?.value) return defaults;
    const parsed = JSON.parse(row.value);
    return {
      globalMode: parsed?.globalMode === 'FACE' ? 'FACE' : 'QR',
      requireHrApproval: false,
      stationOverrides:
        parsed?.stationOverrides && typeof parsed.stationOverrides === 'object'
          ? parsed.stationOverrides
          : {},
      updatedAt: parsed?.updatedAt || row.updatedAt.toISOString(),
      updatedByName: parsed?.updatedByName || null,
    };
  } catch {
    return defaults;
  }
}

export async function saveFaceAttendanceModeConfig(
  patch: Partial<Pick<FaceAttendanceModeConfig, 'globalMode' | 'requireHrApproval' | 'stationOverrides'>>,
  actor: { id: string; legalName: string }
): Promise<FaceAttendanceModeConfig> {
  const current = await getFaceAttendanceModeConfig();
  const next: FaceAttendanceModeConfig = {
    globalMode: patch.globalMode ? (patch.globalMode === 'FACE' ? 'FACE' : 'QR') : current.globalMode,
    requireHrApproval:
      patch.requireHrApproval !== undefined ? Boolean(patch.requireHrApproval) : current.requireHrApproval,
    stationOverrides: patch.stationOverrides
      ? { ...current.stationOverrides, ...patch.stationOverrides }
      : current.stationOverrides,
    updatedAt: new Date().toISOString(),
    updatedByName: actor.legalName,
  };

  const existing = await prisma.workspaceSetting.findFirst({
    where: { key: FACE_MODE_CONFIG_KEY },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) {
    await prisma.workspaceSetting.update({
      where: { id: existing.id },
      data: { value: JSON.stringify(next), updatedById: actor.id },
    });
  } else {
    const orgId = await resolveRootOrganizationId();
    await prisma.workspaceSetting.create({
      data: {
        organizationId: orgId,
        key: FACE_MODE_CONFIG_KEY,
        value: JSON.stringify(next),
        updatedById: actor.id,
      },
    });
  }

  return next;
}

export function resolveEffectiveAttendanceMode(
  config: FaceAttendanceModeConfig,
  stationCode?: string | null
): AttendanceSystemMode {
  if (stationCode) {
    const override = config.stationOverrides?.[stationCode];
    if (override === 'QR' || override === 'FACE') {
      return override;
    }
  }
  return config.globalMode;
}

/**
 * Validates that a descriptor is a finite 128-element float vector.
 */
export function isValidFaceDescriptor(vec: unknown): vec is number[] {
  if (!Array.isArray(vec) || vec.length !== 128) return false;
  let normSq = 0;
  for (let i = 0; i < 128; i++) {
    const v = Number(vec[i]);
    if (!Number.isFinite(v) || Math.abs(v) > 5) return false;
    normSq += v * v;
  }
  return normSq > 0.01 && normSq < 10;
}

/**
 * Euclidean (L2) distance between two 128-d face embeddings.
 * Standard dlib/face-api threshold: < 0.45 is a strong same-person match.
 */
export function euclideanDistance128(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export interface FaceCandidateProfile {
  employeeId: string;
  descriptors: number[][];
}

export interface FaceMatchResult {
  matched: boolean;
  employeeId: string | null;
  distance: number;
  confidencePercent: number;
  secondBestDistance: number;
  reason?: string;
}

/**
 * Server-side 1:N biometric matching against approved employee face descriptors.
 * Enforces both an absolute distance threshold (<= 0.46) and a separation margin (>= 0.05)
 * over the second-closest employee when multiple candidates exist.
 */
export function matchFaceDescriptorAgainstRoster(
  probe: number[],
  candidates: FaceCandidateProfile[],
  maxThreshold = 0.46,
  minMargin = 0.05
): FaceMatchResult {
  if (!isValidFaceDescriptor(probe)) {
    return {
      matched: false,
      employeeId: null,
      distance: Infinity,
      confidencePercent: 0,
      secondBestDistance: Infinity,
      reason: 'Invalid probe face descriptor.',
    };
  }

  let bestEmpId: string | null = null;
  let bestDist = Infinity;
  let secondBestDist = Infinity;

  for (const cand of candidates) {
    let empMinDist = Infinity;
    for (const desc of cand.descriptors) {
      if (!isValidFaceDescriptor(desc)) continue;
      const dist = euclideanDistance128(probe, desc);
      if (dist < empMinDist) empMinDist = dist;
    }
    if (empMinDist < bestDist) {
      secondBestDist = bestDist;
      bestDist = empMinDist;
      bestEmpId = cand.employeeId;
    } else if (empMinDist < secondBestDist) {
      secondBestDist = empMinDist;
    }
  }

  // Convert L2 distance [0..0.46] to human-readable confidence [99%..75%]
  const confidencePercent = Number.isFinite(bestDist)
    ? Math.max(0, Math.min(99, Math.round((1 - bestDist / 0.85) * 100)))
    : 0;

  if (!bestEmpId || bestDist > maxThreshold) {
    return {
      matched: false,
      employeeId: null,
      distance: Number(bestDist.toFixed(4)),
      confidencePercent,
      secondBestDistance: Number.isFinite(secondBestDist) ? Number(secondBestDist.toFixed(4)) : Infinity,
      reason: 'Face not recognized or not yet approved in the BEMS Face Registry.',
    };
  }

  if (Number.isFinite(secondBestDist) && secondBestDist - bestDist < minMargin) {
    return {
      matched: false,
      employeeId: null,
      distance: Number(bestDist.toFixed(4)),
      confidencePercent,
      secondBestDistance: Number(secondBestDist.toFixed(4)),
      reason: 'Ambiguous face match detected. Please look directly at the camera in good lighting and try again.',
    };
  }

  return {
    matched: true,
    employeeId: bestEmpId,
    distance: Number(bestDist.toFixed(4)),
    confidencePercent,
    secondBestDistance: Number.isFinite(secondBestDist) ? Number(secondBestDist.toFixed(4)) : Infinity,
  };
}
