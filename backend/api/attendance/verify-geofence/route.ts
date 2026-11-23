import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
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

    // Find stations
    let station = null;
    if (stationCode) {
      station = await prisma.attendanceStation.findUnique({
        where: { code: stationCode },
      });
    }

    // If no specific station requested, find the closest active station
    if (!station) {
      const activeStations = await prisma.attendanceStation.findMany({
        where: { status: 'ACTIVE' },
      });

      if (activeStations.length === 0) {
        return NextResponse.json(
          { error: 'No active attendance stations configured in the system' },
          { status: 404 }
        );
      }

      let closestDist = Infinity;
      for (const st of activeStations) {
        const dist = calculateHaversineDistance(latNum, lngNum, st.latitude, st.longitude);
        if (dist < closestDist) {
          closestDist = dist;
          station = st;
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

    // Check Starlink IP & Policy Gates
    const policy = await prisma.attendancePolicy.findFirst({
      where: { organizationId: station.organizationId },
    }) || await prisma.attendancePolicy.findFirst();

    const requireGeofence =
      station.requireGeofenceOverride !== null && station.requireGeofenceOverride !== undefined
        ? station.requireGeofenceOverride
        : policy?.requireGeofence ?? true;
    const requireStarlink =
      station.starlinkOverrideMode === 'ENFORCE'
        ? true
        : station.starlinkOverrideMode === 'BYPASS'
        ? false
        : policy?.requireStarlinkIp ?? true;
    const powerOutageMode =
      station.starlinkOverrideMode === 'ENFORCE'
        ? false
        : station.starlinkOverrideMode === 'BYPASS'
        ? true
        : !requireStarlink
        ? true
        : false;
    const starlinkIps = [station.starlinkIpAddresses, policy?.starlinkIpAddresses]
      .filter((s) => Boolean(s && s.trim()))
      .join(', ');
    const earliestCheckInTime = policy?.earliestCheckInTime ?? '07:00';

    const effectiveRadius = (powerOutageMode || !requireStarlink)
      ? Math.max(station.radiusMeters, 250)
      : station.radiusMeters;
    const isInsideGeofence = !requireGeofence || distanceMeters <= effectiveRadius;

    const clientIp = extractClientIp(request);

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
      message = `You are outside ${station.name}. You are ${distanceMeters}m away (maximum allowed: ${station.radiusMeters}m).`;
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
      allowedRadiusMeters: station.radiusMeters,
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
