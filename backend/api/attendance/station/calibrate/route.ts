import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedStation } from '@/lib/attendance/station-auth';
import { extractClientIp } from '@/lib/attendance/token';
import {
  isStationCalibrated,
  markStationCalibrated,
  parseDeviceLabel,
} from '@/lib/attendance/kiosk-sessions';
import { getAuthenticatedEmployee, getHrAuthorizationScope, hasAnyRole } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const rateIp = getClientIp(request);
    const rl = await checkRateLimit(`kiosk-calibrate:${rateIp}`, {
      maxAttempts: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many calibration attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const station = await getAuthenticatedStation(request);
    if (!station) {
      return NextResponse.json(
        { error: 'Unlock the kiosk with the Kiosk Access Password before calibrating location and router.' },
        { status: 401 }
      );
    }

    const alreadyCalibrated = await isStationCalibrated(station.code);
    if (alreadyCalibrated) {
      const actor = await getAuthenticatedEmployee(request).catch(() => null);
      const isExec = actor ? hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN']) : false;
      const hrScope = actor ? await getHrAuthorizationScope(actor) : null;
      if (!isExec && !hrScope?.authorized) {
        return NextResponse.json(
          {
            error:
              'This kiosk station is already calibrated and locked. Ask HR Admin to reset Location & Router IP from the HR Dashboard first.',
          },
          { status: 403 }
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const latNum = Number(body.latitude);
    const lngNum = Number(body.longitude);
    const accuracyNum = body.accuracyMeters !== undefined && body.accuracyMeters !== null ? Number(body.accuracyMeters) : null;
    const requestedRadius = body.radiusMeters !== undefined ? Number(body.radiusMeters) : station.radiusMeters || 100;

    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90 || !Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      return NextResponse.json(
        { error: 'Valid GPS coordinates (latitude & longitude) are required from this kiosk device.' },
        { status: 400 }
      );
    }

    const radiusMeters = Number.isFinite(requestedRadius)
      ? Math.min(1000, Math.max(30, Math.round(requestedRadius)))
      : station.radiusMeters || 100;

    const detectedRouterIp = (extractClientIp(request) || '').trim();
    const isUsablePublicIp =
      Boolean(detectedRouterIp) &&
      detectedRouterIp !== 'unknown' &&
      detectedRouterIp !== '127.0.0.1' &&
      detectedRouterIp !== '::1';

    const updatedStation = await prisma.attendanceStation.update({
      where: { id: station.id },
      data: {
        latitude: latNum,
        longitude: lngNum,
        radiusMeters,
        requireGeofenceOverride: true,
        ...(isUsablePublicIp
          ? {
              starlinkIpAddresses: detectedRouterIp,
              starlinkOverrideMode: 'ENFORCE',
            }
          : {}),
      },
    });

    const deviceLabel = parseDeviceLabel(request.headers.get('user-agent') || '');
    const calibration = await markStationCalibrated({
      stationCode: station.code,
      latitude: latNum,
      longitude: lngNum,
      accuracyMeters: Number.isFinite(accuracyNum as number) ? accuracyNum : null,
      routerIp: isUsablePublicIp ? detectedRouterIp : station.starlinkIpAddresses || detectedRouterIp || null,
      deviceLabel,
    });

    return NextResponse.json({
      success: true,
      stationCode: updatedStation.code,
      stationName: updatedStation.name,
      latitude: updatedStation.latitude,
      longitude: updatedStation.longitude,
      radiusMeters: updatedStation.radiusMeters,
      routerIp: calibration.routerIp,
      calibratedAt: calibration.calibratedAt,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to calibrate kiosk location and router IP.' },
      { status: 500 }
    );
  }
}
