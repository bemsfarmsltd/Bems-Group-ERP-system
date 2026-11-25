import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import {
  listKioskSessions,
  resolveEffectiveStationGates,
} from '@/lib/attendance/kiosk-sessions';
import {
  calculateHaversineDistance,
  extractClientIp,
  isStarlinkIpAllowed,
  getLagosTime,
  validateCheckInTimeWindow,
} from '@/lib/attendance/token';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const rl = await checkRateLimit(`verify-geofence:${getClientIp(request)}`, {
      maxAttempts: 30,
      windowMs: 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many location check requests.' }, { status: 429 });
    }
    const body = await request.json();
    const { employeeId, latitude, longitude, stationCode } = body;

    if (latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: 'Valid latitude and longitude coordinates are required' },
        { status: 400 }
      );
    }

    const latNum = Number(latitude);
    const lngNum = Number(longitude);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return NextResponse.json({ error: 'Coordinates must be valid numbers' }, { status: 400 });
    }

    const clientIp = extractClientIp(request);

    // Find stations
    let station = null;
    if (stationCode) {
      station = await prisma.attendanceStation.findUnique({
        where: { code: stationCode },
      });
    }

    // If no specific station requested, ALWAYS match the closest active station by GPS first
    // (never let a shared /16 Starlink or mobile-carrier IP pick a kiosk in another state).
    if (!station) {
      const [activeStations, kioskSessions] = await Promise.all([
        prisma.attendanceStation.findMany({ where: { status: 'ACTIVE' } }),
        listKioskSessions(),
      ]);

      if (activeStations.length === 0) {
        return NextResponse.json(
          { error: 'No active attendance stations configured in the system' },
          { status: 404 }
        );
      }

      // 1. Closest active station by GPS distance (authoritative across states like Abia vs Edo)
      let closestDist = Infinity;
      for (const st of activeStations) {
        const dist = calculateHaversineDistance(latNum, lngNum, st.latitude, st.longitude);
        if (dist < closestDist) {
          closestDist = dist;
          station = st;
        }
      }

      // 2. Only if two stations are within 2km of the caller (same campus/city), prefer one whose live kiosk matches the exact/subnet router IP
      if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
        const nearbyStations = activeStations.filter(
          (st) => calculateHaversineDistance(latNum, lngNum, st.latitude, st.longitude) <= 2000
        );
        if (nearbyStations.length > 1) {
          const matchingSession = kioskSessions.find(
            (s) =>
              s.status === 'ACTIVE' &&
              s.ipAddress &&
              nearbyStations.some((ns) => ns.code === s.stationCode) &&
              isStarlinkIpAllowed(clientIp, s.ipAddress, false, true).allowed
          );
          if (matchingSession) {
            station = nearbyStations.find((st) => st.code === matchingSession.stationCode) || station;
          }
        }
      }
    }

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const distanceMeters = calculateHaversineDistance(
      latNum,
      lngNum,
      station.latitude,
      station.longitude
    );

    // Check Unified Group + Subsidiary Policy & Live Kiosk Router IP Gates
    let empSubsidiaryId: string | null = null;
    if (employeeId) {
      const asgn = await prisma.employeeAssignment.findFirst({
        where: { employeeId: String(employeeId), status: 'ACTIVE' },
        select: { subsidiaryId: true },
      });
      empSubsidiaryId = asgn?.subsidiaryId || null;
    }

    const gates = await resolveEffectiveStationGates(station, empSubsidiaryId);
    const {
      requireGeofence,
      requireStarlink,
      powerOutageMode,
      awaitingPhoneGpsPin,
      starlinkIps,
      earliestCheckInTime,
    } = gates;

    const effectiveRadius = powerOutageMode || !requireStarlink
      ? Math.max(station.radiusMeters, 250)
      : Math.max(station.radiusMeters, 150);
    const isInsideGeofence = !requireGeofence || awaitingPhoneGpsPin || distanceMeters <= effectiveRadius;

    const { currentTimeStr } = getLagosTime();
    const timeWindowCheck = validateCheckInTimeWindow(currentTimeStr, earliestCheckInTime);

    const starlinkCheck = isStarlinkIpAllowed(
      clientIp,
      starlinkIps,
      powerOutageMode,
      requireStarlink
    );

    const isFullyUnlocked = isInsideGeofence && starlinkCheck.allowed && timeWindowCheck.allowed;

    let message = '';
    if (!timeWindowCheck.allowed) {
      message = timeWindowCheck.reason || 'Arrival window not open yet.';
    } else if (!starlinkCheck.allowed) {
      message = starlinkCheck.reason || 'Please connect to company Starlink Wi-Fi.';
    } else if (!isInsideGeofence) {
      message = `You are outside ${station.name}. You are ${distanceMeters}m away (maximum allowed: ${effectiveRadius}m).`;
    } else {
      message = powerOutageMode
        ? `Location verified (${distanceMeters}m away). Power Outage Mode is active (Starlink check bypassed). Camera scanner unlocked!`
        : `Verified on Company Starlink Wi-Fi & inside ${station.name} (${distanceMeters}m away). Camera scanner unlocked!`;
    }

    return NextResponse.json({
      isInsideGeofence,
      isIpAllowed: starlinkCheck.allowed,
      isTimeWindowAllowed: timeWindowCheck.allowed,
      isFullyUnlocked,
      clientIp,
      requireStarlinkIp: requireStarlink,
      powerOutageMode,
      distanceMeters,
      allowedRadiusMeters: effectiveRadius,
      stationCode: station.code,
      stationName: station.name,
      earliestCheckInTime,
      currentTime: currentTimeStr,
      message,
    });
  } catch (error: any) {
    console.error('Error verifying geofence:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
