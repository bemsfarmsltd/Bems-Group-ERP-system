import { EventEmitter } from 'events';
import { createRedisSubscriber, getRedisClient } from '@/lib/redis';
import { logger } from '@/lib/logger';

export interface RealtimeEvent {
  id: string;
  channel: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

const CHANNEL_PREFIX = 'bems:rt:';

const globalForRealtime = globalThis as unknown as {
  bemsRealtimeBus?: EventEmitter;
};

const localBus =
  globalForRealtime.bemsRealtimeBus ?? (globalForRealtime.bemsRealtimeBus = new EventEmitter());
localBus.setMaxListeners(200);

export async function publishRealtimeEvent(
  channel: string,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  const event: RealtimeEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    channel,
    type,
    payload,
    timestamp: new Date().toISOString(),
  };

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.publish(`${CHANNEL_PREFIX}${channel}`, JSON.stringify(event));
      return;
    } catch (err) {
      logger.warn({ err, channel, type }, 'Redis realtime publish failed; delivering via localBus fallback');
    }
  }

  localBus.emit(channel, event);
}

export function subscribeRealtimeChannel(
  channel: string,
  onEvent: (event: RealtimeEvent) => void
): () => void {
  const seenIds = new Set<string>();
  const dispatch = (event: RealtimeEvent) => {
    if (event.id) {
      if (seenIds.has(event.id)) return;
      seenIds.add(event.id);
      if (seenIds.size > 200) {
        const first = seenIds.values().next().value;
        if (first) seenIds.delete(first);
      }
    }
    onEvent(event);
  };

  localBus.on(channel, dispatch);

  const sub = createRedisSubscriber();
  const fullChannel = `${CHANNEL_PREFIX}${channel}`;
  if (sub) {
    sub
      .subscribe(fullChannel)
      .then(() => {
        sub.on('message', (_ch, raw) => {
          try {
            dispatch(JSON.parse(raw) as RealtimeEvent);
          } catch {}
        });
      })
      .catch((err) => {
        logger.warn({ err, channel }, 'Redis realtime subscribe warning');
      });
  }

  return () => {
    localBus.off(channel, dispatch);
    if (sub) {
      sub.unsubscribe(fullChannel).catch(() => {});
      sub.quit().catch(() => {});
    }
  };
}
