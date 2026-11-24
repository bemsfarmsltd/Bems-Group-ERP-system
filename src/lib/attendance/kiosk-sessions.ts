import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';

export const KIOSK_PASSCODE_KEY = 'ATTENDANCE_KIOSK_ACCESS_PASSWORD';
export const KIOSK_SESSIONS_KEY = 'ATTENDANCE_KIOSK_SESSIONS';

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
