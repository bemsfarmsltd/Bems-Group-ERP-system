import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { verifyAndTouchKioskSession } from '@/lib/attendance/kiosk-sessions';
import { getClientIp } from '@/lib/rate-limiter';

export const KIOSK_COOKIE_NAME = 'bems_kiosk_token';

function readCookieValue(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function resolveActiveStation(code?: string) {
  const station = code
    ? await prisma.attendanceStation.findFirst({
        where: { status: 'ACTIVE', code },
        include: { organization: { select: { legalName: true } } },
      })
    : await prisma.attendanceStation.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        include: { organization: { select: { legalName: true } } },
      });
  if (!station || !station.activeSecret || !station.activeSecret.trim()) return null;
  return station;
}

/**
 * Authenticates a reception attendance kiosk tablet or an executive/HR viewer.
 * Supports:
 * 1. Tracked HttpOnly Kiosk Session (`bems_kiosk_token=ks:<sessionId>`) — revocable anytime by HR Admin
 * 2. Signed-in Executive / HR browser session
 * 3. Legacy `x-station-code` + `x-station-secret` header match
 * Never falls back to unauthenticated public access.
 */
export async function getAuthenticatedStation(request: Request) {
  if (!prisma.attendanceStation) return null;

  const url = new URL(request.url);
  const requestedCode = (request.headers.get('x-station-code') || url.searchParams.get('stationCode') || '').trim();
  const headerSecret = (request.headers.get('x-station-secret') || '').trim();
  const cookieHeader = request.headers.get('cookie') || '';
  const kioskCookie = readCookieValue(cookieHeader, KIOSK_COOKIE_NAME) || '';

  // Path 1: Tracked Kiosk Device Session (`ks:<sessionId>`) — strictly pinned to the station selected at unlock
  if (kioskCookie.startsWith('ks:')) {
    const sessionId = kioskCookie.slice(3).trim();
    const validSession = await verifyAndTouchKioskSession(sessionId);
    if (validSession) {
      const station = await resolveActiveStation(validSession.stationCode);
      if (station) {
        await verifyAndTouchKioskSession(sessionId, {
          stationCode: station.code,
          stationName: station.name,
          stateLocation: station.stateLocation,
          ipAddress: getClientIp(request),
        }).catch(() => {});
        return station;
      }
    }
  }

  // Path 2: Explicit x-station-secret header match (for headless/automated kiosk launchers)
  if (headerSecret && requestedCode) {
    const station = await resolveActiveStation(requestedCode);
    if (station && safeEqual(station.activeSecret, headerSecret)) {
      return station;
    }
  }

  return null;
}
