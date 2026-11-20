import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { markDailyAbsences } from '@/lib/services/attendance-absence-sweeper';

export const dynamic = 'force-dynamic';

function hasValidCronSecret(request: Request): boolean {
  const provided = request.headers.get('x-cron-secret')?.trim() || '';
  if (!provided) return false;
  const expected =
    process.env.CRON_SECRET?.trim() ||
    process.env.BEMS_BOOTSTRAP_SECRET?.trim() ||
    '';
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    const isCron = hasValidCronSecret(request);
    if (!isCron) {
      const actor = await getAuthenticatedEmployee(request);
      if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'])) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const date = typeof body?.date === 'string' ? body.date.trim() : null;
    const dryRun = Boolean(body?.dryRun);

    const result = await markDailyAbsences({ date, dryRun });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[attendance/mark-absences] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to mark daily absences.' },
      { status: 500 }
    );
  }
}
