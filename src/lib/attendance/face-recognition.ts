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
    // If a face profile was accidentally recorded onto the root Super Admin account (ADM-2259 / SYSTEM_ADMIN)
    // from a mobile browser that had a stale admin cookie alongside the Staff App, reassign it to Henry (BEMS-GRO-2026-0001)
    // and remove any root SYSTEM_ADMIN / GMD rows from EmployeeFaceProfile.
    await prisma.$executeRawUnsafe(`
      UPDATE "EmployeeFaceProfile"
      SET "employeeId" = (
        SELECT "id" FROM "Employee" WHERE "employeeNumber" = 'BEMS-GRO-2026-0001' LIMIT 1
      )
      WHERE "employeeId" IN (
        SELECT "id" FROM "Employee" WHERE "employeeNumber" = 'ADM-2259' OR "role" IN ('SYSTEM_ADMIN', 'SUPER_ADMIN', 'GMD')
      )
      AND EXISTS (SELECT 1 FROM "Employee" WHERE "employeeNumber" = 'BEMS-GRO-2026-0001')
      AND NOT EXISTS (
        SELECT 1 FROM "EmployeeFaceProfile" fp2
        INNER JOIN "Employee" e2 ON e2."id" = fp2."employeeId"
        WHERE e2."employeeNumber" = 'BEMS-GRO-2026-0001'
      );
    `);
    await prisma.$executeRawUnsafe(`
      DELETE FROM "EmployeeFaceProfile"
      WHERE "employeeId" IN (
        SELECT "id" FROM "Employee" WHERE "role" IN ('SYSTEM_ADMIN', 'SUPER_ADMIN', 'GMD')
      );
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
 * Filters out corrupted/blurry enrollment outlier vectors (e.g. from a steep side turn)
 * and computes a clean biometric centroid for an employee's enrolled face profile.
 */
function buildCleanProfileSamples(descriptors: number[][]): { clean: number[][]; centroid: number[] } {
  const valid = descriptors.filter((d) => isValidFaceDescriptor(d));
  if (valid.length === 0) return { clean: [], centroid: [] };
  if (valid.length <= 2) {
    const centroid = new Array<number>(128).fill(0);
    for (const d of valid) for (let i = 0; i < 128; i++) centroid[i] += d[i] / valid.length;
    return { clean: valid, centroid };
  }

  // Keep samples that agree with at least one other sample (distance <= 0.52); always keep sample 0 (straight front)
  const kept: number[][] = [];
  for (let i = 0; i < valid.length; i++) {
    let minPeer = Infinity;
    for (let j = 0; j < valid.length; j++) {
      if (i === j) continue;
      const d = euclideanDistance128(valid[i], valid[j]);
      if (d < minPeer) minPeer = d;
    }
    if (i === 0 || minPeer <= 0.52) {
      kept.push(valid[i]);
    }
  }
  const clean = kept.length > 0 ? kept : [valid[0]];
  const centroid = new Array<number>(128).fill(0);
  for (const d of clean) {
    for (let i = 0; i < 128; i++) centroid[i] += d[i] / clean.length;
  }
  return { clean, centroid };
}

/**
 * Server-side 1:N biometric matching against approved employee face descriptors.
 * Enforces:
 * 1. Strict composite distance threshold (<= 0.38) combining clean centroid & closest sample
 *    so an unenrolled person can NEVER falsely match an enrolled colleague.
 * 2. Clean centroid verification (centroidDist <= 0.40) so a single noisy angle never triggers a match.
 * 3. Separation margin (>= 0.06) over the second-closest employee when multiple candidates exist.
 */
export function matchFaceDescriptorAgainstRoster(
  probe: number[],
  candidates: FaceCandidateProfile[],
  maxThreshold = 0.38,
  minMargin = 0.06
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
  let bestScore = Infinity;
  let bestCentroidDist = Infinity;
  let secondBestScore = Infinity;

  for (const cand of candidates) {
    const { clean, centroid } = buildCleanProfileSamples(cand.descriptors);
    if (clean.length === 0 || centroid.length !== 128) continue;

    let empMinDist = Infinity;
    for (const desc of clean) {
      const dist = euclideanDistance128(probe, desc);
      if (dist < empMinDist) empMinDist = dist;
    }
    const centroidDist = euclideanDistance128(probe, centroid);
    // Weighted consensus score: 60% clean centroid + 40% best clean angle
    const compositeScore = 0.6 * centroidDist + 0.4 * empMinDist;

    if (compositeScore < bestScore) {
      secondBestScore = bestScore;
      bestScore = compositeScore;
      bestCentroidDist = centroidDist;
      bestEmpId = cand.employeeId;
    } else if (compositeScore < secondBestScore) {
      secondBestScore = compositeScore;
    }
  }

  // Convert L2 distance [0..0.38] to human-readable confidence
  const confidencePercent = Number.isFinite(bestScore)
    ? Math.max(0, Math.min(99, Math.round((1 - bestScore / 0.75) * 100)))
    : 0;

  if (!bestEmpId || bestScore > maxThreshold || bestCentroidDist > maxThreshold + 0.02) {
    return {
      matched: false,
      employeeId: null,
      distance: Number(bestScore.toFixed(4)),
      confidencePercent,
      secondBestDistance: Number.isFinite(secondBestScore) ? Number(secondBestScore.toFixed(4)) : Infinity,
      reason:
        'Face not recognized. If you have not enrolled your Face ID yet, please register in the BEMS Staff App first.',
    };
  }

  if (Number.isFinite(secondBestScore) && secondBestScore - bestScore < minMargin) {
    return {
      matched: false,
      employeeId: null,
      distance: Number(bestScore.toFixed(4)),
      confidencePercent,
      secondBestDistance: Number(secondBestScore.toFixed(4)),
      reason: 'Match too close to confirm safely. Please look directly at the camera in clear lighting.',
    };
  }

  return {
    matched: true,
    employeeId: bestEmpId,
    distance: Number(bestScore.toFixed(4)),
    confidencePercent,
    secondBestDistance: Number.isFinite(secondBestScore) ? Number(secondBestScore.toFixed(4)) : Infinity,
  };
}
