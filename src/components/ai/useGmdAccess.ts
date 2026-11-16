'use client';
import { useEffect, useState } from 'react';
import { hasGmdFeatureAccess } from '@/lib/gmd-access';

export function useGmdAccess(role: string): boolean {
  const isGmd = String(role || '').toUpperCase() === 'GMD';
  const cacheKey = `bems_ai_enabled_${String(role || '').toUpperCase()}`;
  const [accountEnabled, setAccountEnabled] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached === 'true') return true;
        if (cached === 'false') return false;
      } catch {}
    }
    return null;
  });

  useEffect(() => {
    const c = new AbortController();
    fetch('/api/meta/features', { cache: 'no-store', signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!c.signal.aborted && d && typeof d.accountAiEnabled === 'boolean') {
          setAccountEnabled(d.accountAiEnabled);
          try {
            sessionStorage.setItem(cacheKey, String(d.accountAiEnabled));
          } catch {}
        }
      })
      .catch(() => {});
    return () => c.abort();
  }, [role, cacheKey]);

  if (accountEnabled !== null) return accountEnabled;
  return isGmd || hasGmdFeatureAccess(role, false);
}
