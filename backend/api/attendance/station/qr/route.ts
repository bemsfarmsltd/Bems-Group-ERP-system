import { getAuthenticatedStation } from '@/lib/attendance/station-auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateStationQrToken } from '@/lib/attendance/token';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(`station-qr:${clientIp}`, {
      maxAttempts: 60,
      windowMs: 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many station QR refresh requests. Please wait before retrying.' },
        { status: 429 }
      );
    }

    const station = await getAuthenticatedStation(request);
    if (!station) return NextResponse.json({ error: 'No active office attendance station configured.' }, { status: 404 });

    const { token, expiresInSeconds } = generateStationQrToken(station.code, station.activeSecret);

    const [policy, allStations] = await Promise.all([
      prisma.attendancePolicy.findFirst({
        where: { organizationId: station.organizationId },
      }),
      prisma.attendanceStation.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          code: true,
          name: true,
          stateLocation: true,
          latitude: true,
          longitude: true,
          radiusMeters: true,
          starlinkOverrideMode: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const effectiveRequireStarlink =
      station.starlinkOverrideMode === 'ENFORCE'
        ? true
        : station.starlinkOverrideMode === 'BYPASS'
        ? false
        : policy?.requireStarlinkIp ?? true;
    const effectiveRequireGeofence =
      station.requireGeofenceOverride !== null && station.requireGeofenceOverride !== undefined
        ? station.requireGeofenceOverride
        : policy?.requireGeofence ?? true;

    // Pre-generate both DataURL and vector SVG on the server
    const [qrDataUrl, qrSvg] = await Promise.all([
      QRCode.toDataURL(token, {
        width: 360,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      }),
      QRCode.toString(token, {
        type: 'svg',
        width: 360,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' },
      }),
    ]);

    return NextResponse.json({
      stationId: station.id,
      stationCode: station.code,
      stationSecret: station.activeSecret,
      stationName: station.name,
      stateLocation: station.stateLocation,
      organizationName: station.organization.legalName,
      latitude: station.latitude,
      longitude: station.longitude,
      radiusMeters: station.radiusMeters,
      starlinkOverrideMode: station.starlinkOverrideMode,
      qrToken: token,
      qrDataUrl,
      qrSvg,
      expiresInSeconds,
      powerOutageMode: policy?.starlinkPowerOutageMode ?? false,
      requireStarlinkIp: effectiveRequireStarlink,
      requireGeofence: effectiveRequireGeofence,
      earliestCheckInTime: policy?.earliestCheckInTime || '07:00',
      resumptionTime: policy?.resumptionTime || '08:00',
      closingTime: policy?.closingTime || '17:00',
      gracePeriodMinutes: policy?.gracePeriodMinutes ?? 15,
      latenessDeductionPercent: policy?.latenessDeductionPercent ?? 2,
      stations: allStations,
      timestamp: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
    });
  } catch (error: any) {
    console.error('Error generating station QR token:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
