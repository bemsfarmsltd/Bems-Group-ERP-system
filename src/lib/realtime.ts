import { EventEmitter } from 'events';
import { createRedisSubscriber, getRedisClient } from '@/lib/redis';
import { logger } from '@/lib/logger';

export interface RealtimeEvent {
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
    channel,
    type,
    payload,
    timestamp: new Date().toISOString(),
  };

  localBus.emit(channel, event);

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.publish(`${CHANNEL_PREFIX}${channel}`, JSON.stringify(event));
    } catch (err) {
      logger.warn({ err, channel, type }, 'Redis realtime publish failed; delivered locally');
    }
  }
}

export function subscribeRealtimeChannel(
  channel: string,
  onEvent: (event: RealtimeEvent) => void
): () => void {
  localBus.on(channel, onEvent);

  const sub = createRedisSubscriber();
  const fullChannel = `${CHANNEL_PREFIX}${channel}`;
  if (sub) {
    sub
      .subscribe(fullChannel)
      .then(() => {
        sub.on('message', (_ch, raw) => {
          try {
            onEvent(JSON.parse(raw) as RealtimeEvent);
          } catch {}
        });
      })
      .catch((err) => {
        logger.warn({ err, channel }, 'Redis realtime subscribe warning');
      });
  }

  return () => {
    localBus.off(channel, onEvent);
    if (sub) {
      sub.unsubscribe(fullChannel).catch(() => {});
      sub.quit().catch(() => {});
    }
  };
}
