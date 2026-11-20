import { NextResponse } from 'next/server';
import { checkMobileAppVersion, getMobileAppGate } from '@/lib/mobile-gate';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get('appId') || request.headers.get('x-app-id') || 'GMD_APP';
    const clientVersion = searchParams.get('version') || request.headers.get('x-app-version') || '1.0.0';
    const gate = await getMobileAppGate(appId).catch(() => null);
    const isStaffApp = appId.toUpperCase().includes('STAFF');

    // Web browsers running /staff-app/index.html send Origin/Sec-Fetch-Mode/Mozilla UA;
    // native Flutter APKs use Dart HTTP client (no Origin/Sec-Fetch-Mode, Dart/ UA).
    const origin = request.headers.get('origin') || '';
    const referer = request.headers.get('referer') || '';
    const secFetchMode = request.headers.get('sec-fetch-mode') || '';
    const userAgent = request.headers.get('user-agent') || '';
    const isWebClient =
      Boolean(origin) ||
      referer.includes('/staff-app') ||
      Boolean(secFetchMode) ||
      (userAgent.includes('Mozilla/') && !userAgent.includes('Dart/'));

    if (isWebClient) {
      return NextResponse.json({
        appId: gate?.appId || appId,
        appName: gate?.appName || (isStaffApp ? 'BEMS Staff Portal' : 'BEMS Executive'),
        packageName: gate?.packageName || '',
        clientVersion,
        minimumAllowedVersion: clientVersion,
        latestVersionAvailable: clientVersion,
        forceUpdate: false,
        upgradeRequired: false,
        directDownloadUrl: 'https://bemserp.work/staff-app/index.html',
        upgradePromptNotes: '',
      });
    }

    return NextResponse.json({
      appId: gate?.appId || appId,
      appName: gate?.appName || (isStaffApp ? 'BEMS Staff Portal' : 'BEMS Executive'),
      packageName: gate?.packageName || '',
      clientVersion,
      minimumAllowedVersion: '99.0.0',
      latestVersionAvailable: '99.0.0',
      forceUpdate: true,
      upgradeRequired: true,
      directDownloadUrl: isStaffApp
        ? 'https://bemserp.work/staff-app/index.html'
        : 'https://bemserp.work',
      upgradePromptNotes:
        'Mobile apps are currently disabled. Please use the BEMS web portal at https://bemserp.work.',
    });
  } catch (error) {
    console.error('[mobile/version-check] Error checking version gate:', error);
    return NextResponse.json(
      { error: 'Could not check version gate status.' },
      { status: 500 }
    );
  }
}
