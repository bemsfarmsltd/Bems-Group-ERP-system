const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return RAW_API_BASE ? `${RAW_API_BASE}${normalized}` : normalized;
}

export interface ApiFetchOptions extends RequestInit {
  bearerToken?: string | null;
}

export async function apiFetch<T = any>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { bearerToken, headers, ...rest } = options;
  const mergedHeaders = new Headers(headers || {});
  if (!mergedHeaders.has('Content-Type') && rest.body && !(rest.body instanceof FormData)) {
    mergedHeaders.set('Content-Type', 'application/json');
  }
  if (bearerToken) {
    mergedHeaders.set('Authorization', `Bearer ${bearerToken}`);
  }

  const res = await fetch(resolveApiUrl(path), {
    credentials: 'include',
    ...rest,
    headers: mergedHeaders,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error || payload?.message || `Request failed (${res.status})`;
    const err = new Error(msg) as Error & { status?: number; payload?: unknown };
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload as T;
}
