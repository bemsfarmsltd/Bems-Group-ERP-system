'use client';

import { useEffect } from 'react';
import { resolveApiUrl } from '@/lib/api-client';

export function useRealtimeStream(
  channel: string,
  onEvent: (event: { type: string; payload: Record<string, unknown>; timestamp: string }) => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('EventSource' in window)) return;

    const url = resolveApiUrl(`/api/v1/realtime/stream?channel=${encodeURIComponent(channel)}`);
    const source = new EventSource(url, { withCredentials: true });

    const handler = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        onEvent(parsed);
      } catch {}
    };

    source.addEventListener('message', handler);
    source.addEventListener('approval_updated', handler);
    source.addEventListener('wallet_updated', handler);
    source.addEventListener('chat_message', handler);
    source.addEventListener('notification', handler);

    return () => {
      source.close();
    };
  }, [channel, enabled]);
}
