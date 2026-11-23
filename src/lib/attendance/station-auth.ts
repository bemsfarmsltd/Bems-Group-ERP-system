import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';

export async function getAuthenticatedStation(request: Request) {
  const url = new URL(request.url);
  const code = request.headers.get('x-station-code') || url.searchParams.get('stationCode');
  const secret = request.headers.get('x-station-secret') || url.searchParams.get('stationSecret');
  const actor = await getAuthenticatedEmployee(request, { disallowServiceToken: true }).catch(() => null);
  const executive = actor ? hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN']) : false;

  if (!prisma.attendanceStation) return null;

  // 1. If explicit stationCode is requested (with or without secret), resolve that exact station first
  if (code) {
    const station = await prisma.attendanceStation.findFirst({
      where: { status: 'ACTIVE', code },
      include: { organization: { select: { legalName: true } } },
    });
    if (station && station.activeSecret && station.activeSecret.trim()) {
      if (secret && !executive) {
        const expected = Buffer.from(station.activeSecret);
        const supplied = Buffer.from(secret);
        if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
      }
      return station;
    }
  }

  // 2. Fallback to the primary active station
  const station = await prisma.attendanceStation.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    include: { organization: { select: { legalName: true } } },
  });
  if (!station || !station.activeSecret || !station.activeSecret.trim()) return null;
  return station;
}
