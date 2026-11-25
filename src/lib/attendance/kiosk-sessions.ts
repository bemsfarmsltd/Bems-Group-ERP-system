import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';

export const KIOSK_PASSCODE_KEY = 'ATTENDANCE_KIOSK_ACCESS_PASSWORD';
export const KIOSK_SESSIONS_KEY = 'ATTENDANCE_KIOSK_SESSIONS';
export const KIOSK_CALIBRATION_KEY = 'ATTENDANCE_KIOSK_CALIBRATION';

export interface StationCalibrationMeta {
  calibrated: boolean;
  awaitingPhoneGpsPin?: boolean;
  calibratedAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  routerIp?: string | null;
  deviceLabel?: string | null;
  resetAt?: string | null;
  resetByName?: string | null;
}

export interface KioskPasswordMeta {
  hash: string;
  salt: string;
  updatedAt: string;
  updatedByName: string;
}

export interface KioskDeviceSession {
  id: string;
  stationCode: string;
  stationName: string;
  stateLocation?: string | null;
  deviceLabel: string;
  ipAddress: string;
  activatedBy: string;
  activatedAt: string;
  lastSeenAt: string;
  status: 'ACTIVE' | 'REVOKED';
  revokedAt?: string | null;
  revokedByName?: string | null;
}

async function resolveRootOrganizationId(): Promise<string> {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return org?.id || 'BEMS_GROUP';
}

export function hashKioskPassword(plain: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 32).toString('hex');
  return { hash, salt };
}

export function verifyKioskPasswordHash(plain: string, meta: KioskPasswordMeta): boolean {
  if (!plain || !meta?.hash || !meta?.salt) return false;
  try {
    const computed = scryptSync(plain, meta.salt, 32);
    const expected = Buffer.from(meta.hash, 'hex');
    if (computed.length !== expected.length) return false;
    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

export async function getKioskPasswordMeta(): Promise<KioskPasswordMeta | null> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { key: KIOSK_PASSCODE_KEY },
    orderBy: { updatedAt: 'desc' },
  });
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as KioskPasswordMeta;
    return parsed?.hash && parsed?.salt ? parsed : null;
  } catch {
    return null;
  }
}

export async function setKioskPassword(
  plainPassword: string,
  actorId: string,
  actorName: string
): Promise<{ updatedAt: string; updatedByName: string }> {
  const { hash, salt } = hashKioskPassword(plainPassword);
  const nowIso = new Date().toISOString();
  const payload: KioskPasswordMeta = {
    hash,
    salt,
    updatedAt: nowIso,
    updatedByName: actorName,
  };

  const existing = await prisma.workspaceSetting.findFirst({
    where: { key: KIOSK_PASSCODE_KEY },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) {
    await prisma.workspaceSetting.update({
      where: { id: existing.id },
      data: { value: JSON.stringify(payload), updatedById: actorId },
    });
  } else {
    const orgId = await resolveRootOrganizationId();
    await prisma.workspaceSetting.create({
      data: {
        organizationId: orgId,
        key: KIOSK_PASSCODE_KEY,
        value: JSON.stringify(payload),
        updatedById: actorId,
      },
    });
  }

  return { updatedAt: nowIso, updatedByName: actorName };
}

export async function listKioskSessions(): Promise<KioskDeviceSession[]> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { key: KIOSK_SESSIONS_KEY },
    orderBy: { updatedAt: 'desc' },
  });
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as KioskDeviceSession[]) : [];
  } catch {
    return [];
  }
}

async function saveKioskSessions(sessions: KioskDeviceSession[], actorId?: string | null): Promise<void> {
  // Keep up to 100 most recent sessions
  const trimmed = sessions.slice(0, 100);
  const existing = await prisma.workspaceSetting.findFirst({
    where: { key: KIOSK_SESSIONS_KEY },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) {
    await prisma.workspaceSetting.update({
      where: { id: existing.id },
      data: { value: JSON.stringify(trimmed), ...(actorId ? { updatedById: actorId } : {}) },
    });
  } else {
    const orgId = await resolveRootOrganizationId();
    const resolvedActorId =
      actorId ||
      (await prisma.employee.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } }))?.id ||
      'SYSTEM';
    await prisma.workspaceSetting.create({
      data: {
        organizationId: orgId,
        key: KIOSK_SESSIONS_KEY,
        value: JSON.stringify(trimmed),
        updatedById: resolvedActorId,
      },
    });
  }
}

export function parseDeviceLabel(userAgent: string): string {
  const ua = userAgent || '';
  const os = /iPad/i.test(ua)
    ? 'iPad'
    : /iPhone/i.test(ua)
    ? 'iPhone'
    : /Android/i.test(ua)
    ? 'Android Tablet/Phone'
    : /Macintosh|Mac OS/i.test(ua)
    ? 'macOS'
    : /Windows/i.test(ua)
    ? 'Windows PC'
    : /Linux/i.test(ua)
    ? 'Linux'
    : 'Browser Device';

  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Chrome\//i.test(ua)
    ? 'Chrome'
    : /Safari\//i.test(ua) && !/Chrome\//i.test(ua)
    ? 'Safari'
    : /Firefox\//i.test(ua)
    ? 'Firefox'
    : 'Web';

  return `${os} · ${browser}`;
}

export async function createKioskSession(params: {
  stationCode: string;
  stationName: string;
  stateLocation?: string | null;
  deviceLabel: string;
  ipAddress: string;
  activatedBy: string;
}): Promise<KioskDeviceSession> {
  const nowIso = new Date().toISOString();
  const session: KioskDeviceSession = {
    id: randomBytes(24).toString('hex'),
    stationCode: params.stationCode,
    stationName: params.stationName,
    stateLocation: params.stateLocation || null,
    deviceLabel: params.deviceLabel,
    ipAddress: params.ipAddress,
    activatedBy: params.activatedBy,
    activatedAt: nowIso,
    lastSeenAt: nowIso,
    status: 'ACTIVE',
  };

  const current = await listKioskSessions();
  await saveKioskSessions([session, ...current]);
  return session;
}

export async function verifyAndTouchKioskSession(
  sessionId: string,
  stationUpdate?: { stationCode: string; stationName: string; stateLocation?: string | null; ipAddress?: string }
): Promise<KioskDeviceSession | null> {
  if (!sessionId) return null;
  const sessions = await listKioskSessions();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return null;
  const found = sessions[idx];
  if (found.status !== 'ACTIVE') return null;

  const nowMs = Date.now();
  const lastMs = Date.parse(found.lastSeenAt || '') || 0;
  const stationChanged = Boolean(stationUpdate && stationUpdate.stationCode !== found.stationCode);

  // Touch DB at most once every 2 minutes unless the station switched
  if (stationChanged || nowMs - lastMs > 2 * 60 * 1000) {
    sessions[idx] = {
      ...found,
      lastSeenAt: new Date(nowMs).toISOString(),
      ...(stationUpdate
        ? {
            stationCode: stationUpdate.stationCode,
            stationName: stationUpdate.stationName,
            stateLocation: stationUpdate.stateLocation ?? found.stateLocation,
            ...(stationUpdate.ipAddress ? { ipAddress: stationUpdate.ipAddress } : {}),
          }
        : {}),
    };
    await saveKioskSessions(sessions).catch(() => {});
  }

  return sessions[idx];
}

export async function revokeKioskSession(
  sessionId: string,
  actorId: string,
  actorName: string
): Promise<KioskDeviceSession[]> {
  const nowIso = new Date().toISOString();
  const sessions = await listKioskSessions();
  const updated = sessions.map((s) =>
    s.id === sessionId
      ? { ...s, status: 'REVOKED' as const, revokedAt: nowIso, revokedByName: actorName }
      : s
  );
  await saveKioskSessions(updated, actorId);
  return updated;
}

export async function revokeAllKioskSessions(
  actorId: string,
  actorName: string
): Promise<KioskDeviceSession[]> {
  const nowIso = new Date().toISOString();
  const sessions = await listKioskSessions();
  const updated = sessions.map((s) =>
    s.status === 'ACTIVE'
      ? { ...s, status: 'REVOKED' as const, revokedAt: nowIso, revokedByName: actorName }
      : s
  );
  await saveKioskSessions(updated, actorId);
  return updated;
}

export async function getStationCalibrationMap(): Promise<Record<string, StationCalibrationMeta>> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { key: KIOSK_CALIBRATION_KEY },
    orderBy: { updatedAt: 'desc' },
  });
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, StationCalibrationMeta>)
      : {};
  } catch {
    return {};
  }
}

async function saveStationCalibrationMap(
  map: Record<string, StationCalibrationMeta>,
  actorId?: string | null
): Promise<void> {
  const existing = await prisma.workspaceSetting.findFirst({
    where: { key: KIOSK_CALIBRATION_KEY },
    orderBy: { updatedAt: 'desc' },
  });

  if (existing) {
    await prisma.workspaceSetting.update({
      where: { id: existing.id },
      data: { value: JSON.stringify(map), ...(actorId ? { updatedById: actorId } : {}) },
    });
  } else {
    const orgId = await resolveRootOrganizationId();
    const resolvedActorId =
      actorId ||
      (await prisma.employee.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } }))?.id ||
      'SYSTEM';
    await prisma.workspaceSetting.create({
      data: {
        organizationId: orgId,
        key: KIOSK_CALIBRATION_KEY,
        value: JSON.stringify(map),
        updatedById: resolvedActorId,
      },
    });
  }
}

export async function isStationCalibrated(stationCode: string): Promise<boolean> {
  if (!stationCode) return false;
  const map = await getStationCalibrationMap();
  return Boolean(map[stationCode]?.calibrated);
}

export async function markStationCalibrated(params: {
  stationCode: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  routerIp?: string | null;
  deviceLabel?: string | null;
  awaitingPhoneGpsPin?: boolean;
}): Promise<StationCalibrationMeta> {
  const map = await getStationCalibrationMap();
  const prev = map[params.stationCode] || { calibrated: false };
  const next: StationCalibrationMeta = {
    ...prev,
    calibrated: true,
    awaitingPhoneGpsPin: Boolean(params.awaitingPhoneGpsPin),
    calibratedAt: new Date().toISOString(),
    latitude: params.latitude ?? prev.latitude ?? null,
    longitude: params.longitude ?? prev.longitude ?? null,
    accuracyMeters: params.accuracyMeters ?? null,
    routerIp: params.routerIp || prev.routerIp || null,
    deviceLabel: params.deviceLabel || prev.deviceLabel || null,
  };
  map[params.stationCode] = next;
  await saveStationCalibrationMap(map);
  return next;
}

export async function pinStationGpsFromPhoneScan(params: {
  stationId: string;
  stationCode: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  const map = await getStationCalibrationMap();
  const meta = map[params.stationCode];
  if (!meta?.awaitingPhoneGpsPin) return;

  await prisma.attendanceStation.update({
    where: { id: params.stationId },
    data: {
      latitude: params.latitude,
      longitude: params.longitude,
    },
  });

  map[params.stationCode] = {
    ...meta,
    calibrated: true,
    awaitingPhoneGpsPin: false,
    latitude: params.latitude,
    longitude: params.longitude,
    calibratedAt: new Date().toISOString(),
  };
  await saveStationCalibrationMap(map);
}

export async function getActiveStationSessionIps(stationCode: string): Promise<string[]> {
  const sessions = await listKioskSessions();
  const ips = new Set<string>();
  for (const s of sessions) {
    if (s.status === 'ACTIVE' && s.stationCode === stationCode && s.ipAddress) {
      const clean = s.ipAddress.trim();
      if (clean && clean !== 'unknown' && clean !== '127.0.0.1' && clean !== '::1') {
        ips.add(clean);
      }
    }
  }
  return Array.from(ips);
}

export async function resolveEffectiveStationGates(
  station: {
    id: string;
    code: string;
    organizationId: string;
    radiusMeters: number;
    starlinkOverrideMode?: string | null;
    starlinkIpAddresses?: string | null;
    requireGeofenceOverride?: boolean | null;
  },
  employeeSubsidiaryId?: string | null
) {
  const [groupOrg, calMap, liveKioskIps] = await Promise.all([
    prisma.organization.findFirst({
      where: { type: 'GROUP', status: 'ACTIVE' },
      select: { id: true },
    }),
    getStationCalibrationMap(),
    getActiveStationSessionIps(station.code),
  ]);

  const targetOrgId = employeeSubsidiaryId || station.organizationId;
  const [groupPolicy, localPolicy] = await Promise.all([
    groupOrg ? prisma.attendancePolicy.findUnique({ where: { organizationId: groupOrg.id } }) : Promise.resolve(null),
    targetOrgId
      ? prisma.attendancePolicy.findUnique({ where: { organizationId: targetOrgId } })
      : prisma.attendancePolicy.findFirst(),
  ]);

  const effectivePolicy = localPolicy || groupPolicy || (await prisma.attendancePolicy.findFirst());
  const calMeta = calMap[station.code];
  const awaitingPhoneGpsPin = Boolean(calMeta?.awaitingPhoneGpsPin);

  // Group-level or local-level OFF / Power Outage switches ALWAYS act as master overrides so HR Admin never gets stuck
  const anyPowerOutage = Boolean(groupPolicy?.starlinkPowerOutageMode || localPolicy?.starlinkPowerOutageMode);
  const anyStarlinkOff = groupPolicy?.requireStarlinkIp === false || localPolicy?.requireStarlinkIp === false;
  const anyGeofenceOff = groupPolicy?.requireGeofence === false || localPolicy?.requireGeofence === false;

  const requireStarlink =
    anyPowerOutage || anyStarlinkOff || station.starlinkOverrideMode === 'BYPASS'
      ? false
      : station.starlinkOverrideMode === 'ENFORCE'
      ? true
      : effectivePolicy?.requireStarlinkIp ?? true;

  const powerOutageMode = anyPowerOutage || station.starlinkOverrideMode === 'BYPASS' || !requireStarlink;

  const requireGeofence =
    anyGeofenceOff || station.requireGeofenceOverride === false || awaitingPhoneGpsPin
      ? false
      : station.requireGeofenceOverride === true
      ? true
      : effectivePolicy?.requireGeofence ?? true;

  const starlinkIps = [
    ...liveKioskIps,
    calMeta?.routerIp,
    station.starlinkIpAddresses,
    localPolicy?.starlinkIpAddresses,
    groupPolicy?.starlinkIpAddresses,
  ]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(', ');

  return {
    policy: effectivePolicy,
    requireStarlink,
    powerOutageMode,
    requireGeofence,
    awaitingPhoneGpsPin,
    starlinkIps,
    liveKioskIps,
    earliestCheckInTime: effectivePolicy?.earliestCheckInTime || '07:00',
    resumptionTime: effectivePolicy?.resumptionTime || '08:00',
    closingTime: effectivePolicy?.closingTime || '17:00',
    graceMinutes: effectivePolicy?.gracePeriodMinutes ?? 30,
    latenessDeductionPercent: effectivePolicy?.latenessDeductionPercent ?? 2.0,
  };
}

export async function resetStationCalibration(
  stationCodeOrAll: string,
  actorId: string,
  actorName: string
): Promise<Record<string, StationCalibrationMeta>> {
  const map = await getStationCalibrationMap();
  const nowIso = new Date().toISOString();

  if (stationCodeOrAll === 'ALL') {
    const stations = await prisma.attendanceStation.findMany({
      where: { status: 'ACTIVE' },
      select: { code: true },
    });
    const codes = new Set([...Object.keys(map), ...stations.map((s) => s.code)]);
    for (const code of codes) {
      map[code] = {
        ...(map[code] || {}),
        calibrated: false,
        resetAt: nowIso,
        resetByName: actorName,
      };
    }
  } else {
    map[stationCodeOrAll] = {
      ...(map[stationCodeOrAll] || {}),
      calibrated: false,
      resetAt: nowIso,
      resetByName: actorName,
    };
  }

  await saveStationCalibrationMap(map, actorId);
  return map;
}
