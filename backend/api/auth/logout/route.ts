import { NextResponse } from 'next/server';
import { destroyEmployeeSession, getSessionCookieOptions } from '@/lib/auth';

function getPublicRedirectUrl(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl) {
    return envUrl.endsWith('/') ? envUrl : `${envUrl}/`;
  }
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost && !forwardedHost.includes('0.0.0.0') && !forwardedHost.includes('localhost')) {
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${forwardedHost}/`;
  }
  return 'https://bemserp.work/';
}

function makeLogoutResponse(redirectUrl?: string) {
  const res = redirectUrl
    ? NextResponse.redirect(redirectUrl)
    : NextResponse.json({ success: true });

  const clearOptions = getSessionCookieOptions(new Date(0), 0);

  res.cookies.set('bems_session', '', clearOptions);
  res.cookies.delete('bems_session');

  const domainSuffix = clearOptions.domain ? `; Domain=${clearOptions.domain}` : '';

  // Explicit headers to guarantee Chrome, Safari, Firefox completely clear it:
  res.headers.append(
    'Set-Cookie',
    `bems_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax; Secure${domainSuffix}`
  );
  res.headers.append(
    'Set-Cookie',
    `bems_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${domainSuffix}`
  );

  return res;
}

export async function POST(request: Request) {
  await destroyEmployeeSession(request);
  return makeLogoutResponse();
}

export async function GET(request: Request) {
  await destroyEmployeeSession(request);
  const targetUrl = getPublicRedirectUrl(request);
  return makeLogoutResponse(targetUrl);
}
