import { NextResponse } from 'next/server';
import { getAuthenticatedEmployee, getHrAuthorizationScope, hasAnyRole } from '@/lib/auth';
import {
  getKioskPasswordMeta,
  listKioskSessions,
  revokeAllKioskSessions,
  revokeKioskSession,
  setKioskPassword,
} from '@/lib/attendance/kiosk-sessions';

export const dynamic = 'force-dynamic';

async function authorizeKioskAdmin(request: Request) {
  const actor = await getAuthenticatedEmployee(request);
  if (!actor) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const isExec = hasAnyRole(actor, ['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN']);
  const hrScope = await getHrAuthorizationScope(actor);
  if (!isExec && !hrScope.authorized) {
    return { error: NextResponse.json({ error: 'Forbidden: HR or Executive access required.' }, { status: 403 }) };
  }
  return { actor };
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeKioskAdmin(request);
    if ('error' in auth) return auth.error;

    const [pwMeta, sessions] = await Promise.all([
      getKioskPasswordMeta(),
      listKioskSessions(),
    ]);

    return NextResponse.json({
      success: true,
      hasPassword: Boolean(pwMeta),
      passwordUpdatedAt: pwMeta?.updatedAt || null,
      passwordUpdatedByName: pwMeta?.updatedByName || null,
      activeCount: sessions.filter((s) => s.status === 'ACTIVE').length,
      sessions,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load kiosk access settings.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeKioskAdmin(request);
    if ('error' in auth) return auth.error;
    const { actor } = auth;

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '').toUpperCase();

    if (action === 'SET_PASSWORD') {
      const password = String(body.password || '').trim();
      if (password.length < 4) {
        return NextResponse.json({ error: 'Kiosk access password must be at least 4 characters.' }, { status: 400 });
      }
      const meta = await setKioskPassword(password, actor.id, actor.legalName);
      let sessions = await listKioskSessions();
      if (body.revokeExisting === true) {
        sessions = await revokeAllKioskSessions(actor.id, actor.legalName);
      }
      return NextResponse.json({
        success: true,
        hasPassword: true,
        passwordUpdatedAt: meta.updatedAt,
        passwordUpdatedByName: meta.updatedByName,
        activeCount: sessions.filter((s) => s.status === 'ACTIVE').length,
        sessions,
      });
    }

    if (action === 'REVOKE_SESSION') {
      const sessionId = String(body.sessionId || '').trim();
      if (!sessionId) {
        return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 });
      }
      const sessions = await revokeKioskSession(sessionId, actor.id, actor.legalName);
      return NextResponse.json({
        success: true,
        activeCount: sessions.filter((s) => s.status === 'ACTIVE').length,
        sessions,
      });
    }

    if (action === 'REVOKE_ALL_SESSIONS') {
      const sessions = await revokeAllKioskSessions(actor.id, actor.legalName);
      return NextResponse.json({
        success: true,
        activeCount: 0,
        sessions,
      });
    }

    return NextResponse.json({ error: 'Unsupported kiosk access action.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update kiosk access.' }, { status: 500 });
  }
}
