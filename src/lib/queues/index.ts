import { Queue, Worker, type Job } from 'bullmq';
import { getRedisClient, isRedisConfigured } from '@/lib/redis';
import { logger, captureServerError } from '@/lib/logger';

export const QUEUE_NAMES = {
  OUTBOX_NOTIFICATIONS: 'bems-outbox-notifications',
  WALLET_DISBURSEMENTS: 'bems-wallet-disbursements',
  PAYROLL_BATCHES: 'bems-payroll-batches',
  ID_CARD_AUDIT: 'bems-id-card-audit',
} as const;

export type BemsQueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queueCache = new Map<BemsQueueName, Queue>();

export function getQueue(name: BemsQueueName): Queue | null {
  if (!isRedisConfigured()) return null;
  const existing = queueCache.get(name);
  if (existing) return existing;

  const conn = getRedisClient();
  if (!conn) return null;

  const q = new Queue(name, {
    connection: conn as any,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  });
  queueCache.set(name, q);
  return q;
}

export async function enqueueBackgroundJob<T extends Record<string, unknown>>(
  queueName: BemsQueueName,
  jobName: string,
  payload: T
): Promise<{ queued: boolean; jobId?: string; mode: 'bullmq' | 'inline-noop' }> {
  const queue = getQueue(queueName);
  if (!queue) {
    logger.debug({ queueName, jobName }, 'REDIS_URL unset; job recorded in inline-noop mode');
    return { queued: false, mode: 'inline-noop' };
  }

  const job = await queue.add(jobName, payload);
  return { queued: true, jobId: job.id, mode: 'bullmq' };
}

export function startBackgroundWorkers(handlers: Partial<Record<BemsQueueName, (job: Job) => Promise<void>>>) {
  if (!isRedisConfigured()) {
    logger.info('REDIS_URL not configured; BullMQ workers skipped');
    return [] as Worker[];
  }
  const conn = getRedisClient();
  if (!conn) return [] as Worker[];

  const workers: Worker[] = [];
  for (const [name, handler] of Object.entries(handlers)) {
    if (!handler) continue;
    const worker = new Worker(
      name,
      async (job) => {
        logger.info({ queue: name, jobId: job.id, jobName: job.name }, 'Processing BullMQ job');
        await handler(job);
      },
      { connection: conn as any, concurrency: 5 }
    );
    worker.on('failed', (job, err) => {
      captureServerError(err, { queue: name, jobId: job?.id, jobName: job?.name });
    });
    workers.push(worker);
  }
  return workers;
}
