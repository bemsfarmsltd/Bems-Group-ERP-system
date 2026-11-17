import { cookies, headers } from 'next/headers';

export type SsrActor = {
  id: string;
  employeeNumber: string;
  legalName: string;
  workEmail: string;
  phone: string | null;
  role: string;
  avatarUrl: string | null;
  customAdminProfileId?: string | null;
  customAdminTitle?: string | null;
  customAdminPermissions?: Record<string, unknown> | null;
};

async function resolveBackendBaseUrl(): Promise<string> {
  const configured = (process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;

  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    const proto = h.get('x-forwarded-proto') || 'https';
    if (host) return `${proto}://${host}`;
  } catch {
    // Fallback to local loopback
  }
  const port = process.env.PORT || '3000';
  return `http://127.0.0.1:${port}`;
}

async function getCookieHeader(): Promise<string> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('bems_session')?.value;
    if (token) return `bems_session=${encodeURIComponent(token)}`;
  } catch {
    // Ignore when outside request scope
  }
  return '';
}

export function hasSsrAnyRole(actor: SsrActor | null | undefined, roles: string[]): boolean {
  if (!actor?.role) return false;
  return roles.includes(String(actor.role).toUpperCase());
}

export async function getSsrActor(): Promise<SsrActor | null> {
  const baseUrl = await resolveBackendBaseUrl();
  const cookie = await getCookieHeader();
  if (!cookie) return null;

  try {
    const res = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'GET',
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.user as SsrActor) || null;
  } catch {
    return null;
  }
}

export async function getSsrPageData<T = any>(
  page: string,
  extraParams?: Record<string, string>
): Promise<{ status: number; data: T | null }> {
  const baseUrl = await resolveBackendBaseUrl();
  const cookie = await getCookieHeader();
  const qs = new URLSearchParams({ page, ...(extraParams || {}) });

  try {
    const res = await fetch(`${baseUrl}/api/v1/ssr/page-data?${qs.toString()}`, {
      method: 'GET',
      headers: cookie ? { cookie } : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { status: res.status, data: null };
    }
    const data = (await res.json()) as T;
    return { status: res.status, data };
  } catch {
    return { status: 502, data: null };
  }
}
