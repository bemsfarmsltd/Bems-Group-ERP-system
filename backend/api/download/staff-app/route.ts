import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { error: 'Mobile APK downloads are disabled. Please use the BEMS web portal at https://bemserp.work/staff-app/index.html.' },
    { status: 410 }
  );
}
