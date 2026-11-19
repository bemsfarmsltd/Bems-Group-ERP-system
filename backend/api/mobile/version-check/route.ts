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
