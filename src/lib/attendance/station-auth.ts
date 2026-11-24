import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';

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

/**
 * Authenticates a reception attendance kiosk tablet or an executive/HR viewer.
 * Never falls back to returning an unauthenticated station or leaking secrets.
 */
export async function getAuthenticatedStation(request: Request) {
  if (!prisma.attendanceStation) return null;

  const url = new URL(request.url);
  const requestedCode = (request.headers.get('x-station-code') || url.searchParams.get('stationCode') || '').trim();
  const headerSecret = (request.headers.get('x-station-secret') || '').trim();

  // 1. Check HttpOnly kiosk activation cookie (`<stationCode>:<activeSecret>`)
  const cookieHeader = request.headers.get('cookie') || '';
  const kioskCookie = readCookieValue(cookieHeader, KIOSK_COOKIE_NAME);
  let cookieCode = '';
  let cookieSecret = '';
  if (kioskCookie && kioskCookie.includes(':')) {
    const sep = kioskCookie.indexOf(':');
    cookieCode = kioskCookie.slice(0, sep).trim();
    cookieSecret = kioskCookie.slice(sep + 1).trim();
  }

  // 2. Check authenticated Executive / HR session
  const actor = await getAuthenticatedEmployee(request, { disallowServiceToken: true }).catch(() => null);
  const isExecutiveOrHr = actor ? hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'CUSTOM_ADMIN']) : false;

  const targetCode = requestedCode || cookieCode;

  // Path A: Executive/HR signed-in browser (e.g. launching Reception Kiosk from /attendance)
  if (isExecutiveOrHr) {
    const station = targetCode
      ? await prisma.attendanceStation.findFirst({
          where: { status: 'ACTIVE', code: targetCode },
          include: { organization: { select: { legalName: true } } },
        })
      : await prisma.attendanceStation.findFirst({
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          include: { organization: { select: { legalName: true } } },
        });
    if (station && station.activeSecret && station.activeSecret.trim()) {
      return station;
    }
    return null;
  }

  // Path B: Activated Kiosk Tablet via HttpOnly cookie or explicit x-station-secret header
  const suppliedSecret = headerSecret || cookieSecret;
  if (!suppliedSecret || !targetCode) {
    return null;
  }

  const station = await prisma.attendanceStation.findFirst({
    where: { status: 'ACTIVE', code: targetCode },
    include: { organization: { select: { legalName: true } } },
  });
  if (!station || !station.activeSecret || !station.activeSecret.trim()) {
    return null;
  }
  if (!safeEqual(station.activeSecret, suppliedSecret)) {
    return null;
  }
  return station;
}
