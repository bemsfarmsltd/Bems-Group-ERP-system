'use client';

import { useEffect } from 'react';

const BRIDGE_INSTALLED_KEY = '__bemsApiFetchBridgeInstalled';

function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
}

function shouldRewriteApiPath(rawUrl: string): boolean {
  return (
    rawUrl === '/api' ||
    rawUrl.startsWith('/api/') ||
    rawUrl.startsWith('/uploads/') ||
    rawUrl.startsWith('/secure-uploads/') ||
    (rawUrl.startsWith('/download/') && rawUrl.toLowerCase().endsWith('.apk'))
  );
}

export function installApiFetchBridge(): void {
  if (typeof window === 'undefined') return;
  const apiBase = getApiBaseUrl();
  if (!apiBase) return;

  const win = window as unknown as Record<string, unknown>;
  if (win[BRIDGE_INSTALLED_KEY]) return;
  win[BRIDGE_INSTALLED_KEY] = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = function bemsPatchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    if (typeof input === 'string' && shouldRewriteApiPath(input)) {
      return originalFetch(`${apiBase}${input}`, {
        ...init,
        credentials: init?.credentials ?? 'include',
      });
    }

    if (input instanceof URL && input.origin === window.location.origin && shouldRewriteApiPath(input.pathname)) {
      const target = `${apiBase}${input.pathname}${input.search}${input.hash}`;
      return originalFetch(target, {
        ...init,
        credentials: init?.credentials ?? 'include',
      });
    }

    if (typeof Request !== 'undefined' && input instanceof Request) {
      try {
        const parsed = new URL(input.url, window.location.origin);
        if (parsed.origin === window.location.origin && shouldRewriteApiPath(parsed.pathname)) {
          const target = `${apiBase}${parsed.pathname}${parsed.search}${parsed.hash}`;
          const nextReq = new Request(target, input);
          return originalFetch(nextReq, {
            ...init,
            credentials: init?.credentials ?? input.credentials ?? 'include',
          });
        }
      } catch {
        // Fall through to original fetch if URL parsing fails
      }
    }

    return originalFetch(input, init);
  };

  if (typeof window.EventSource === 'function') {
    const OriginalEventSource = window.EventSource;
    const PatchedEventSource = function BemsEventSource(
      url: string | URL,
      eventSourceInitDict?: EventSourceInit
    ) {
      let targetUrl: string | URL = url;
      if (typeof url === 'string' && shouldRewriteApiPath(url)) {
        targetUrl = `${apiBase}${url}`;
      } else if (url instanceof URL && url.origin === window.location.origin && shouldRewriteApiPath(url.pathname)) {
        targetUrl = `${apiBase}${url.pathname}${url.search}${url.hash}`;
      }
      return new OriginalEventSource(targetUrl, {
        ...eventSourceInitDict,
        withCredentials: eventSourceInitDict?.withCredentials ?? true,
      });
    } as unknown as typeof EventSource;

    PatchedEventSource.prototype = OriginalEventSource.prototype;
    Object.defineProperty(PatchedEventSource, 'CONNECTING', { value: OriginalEventSource.CONNECTING });
    Object.defineProperty(PatchedEventSource, 'OPEN', { value: OriginalEventSource.OPEN });
    Object.defineProperty(PatchedEventSource, 'CLOSED', { value: OriginalEventSource.CLOSED });
    window.EventSource = PatchedEventSource;
  }
}

if (typeof window !== 'undefined') {
  installApiFetchBridge();
}

export function ApiFetchBridge() {
  useEffect(() => {
    installApiFetchBridge();
  }, []);
  return null;
}
