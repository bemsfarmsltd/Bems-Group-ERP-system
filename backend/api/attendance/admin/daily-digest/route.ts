import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee, hasAnyRole } from '@/lib/auth';
import { sendDailyAttendanceDigestEmail } from '@/lib/notifications/attendance-digest';

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
    const actor = isCron ? null : await getAuthenticatedEmployee(request);

    if (!isCron) {
      if (!actor) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN'])) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const date = typeof body?.date === 'string' ? body.date.trim() : null;
    const subsidiaryId = typeof body?.subsidiaryId === 'string' ? body.subsidiaryId.trim() : null;
    const recipients = Array.isArray(body?.recipients)
      ? body.recipients.filter((e: unknown): e is string => typeof e === 'string' && e.includes('@'))
      : undefined;

    const result = await sendDailyAttendanceDigestEmail({
      actor: actor || undefined,
      date,
      subsidiaryId,
      recipients,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    console.error('[attendance/daily-digest] Failed:', error);
    return NextResponse.json(
      { error: 'Failed to send daily attendance digest.' },
      { status: 500 }
    );
  }
}
