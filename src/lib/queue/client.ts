import { getRedis } from '@/lib/redis';
import * as Sentry from '@sentry/nextjs';
import type { WorkerOptions } from 'bullmq';
import { Queue, QueueEvents, Worker } from 'bullmq';

/**
 * Get default queue options with lazy-initialized Redis connection
 * @internal - Used internally by createQueue factory
 */
const SECONDS_PER_DAY = 86400;

function getDefaultQueueOptions() {
  return {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS!, 10),
      backoff: {
        type: 'exponential' as const,
        delay: parseInt(process.env.QUEUE_BACKOFF_DELAY_SEC!, 10) * 1000, // convert to ms
      },
      removeOnComplete: {
        age: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE_DAYS!, 10) * SECONDS_PER_DAY,
        count: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE_COUNT!, 10),
      },
      removeOnFail: {
        age: parseInt(process.env.QUEUE_REMOVE_ON_FAIL_DAYS!, 10) * SECONDS_PER_DAY,
        count: parseInt(process.env.QUEUE_REMOVE_ON_FAIL_COUNT!, 10),
      },
    },
  };
}

/**
 * Get default worker options with lazy-initialized Redis connection
 * @internal - Used internally by createWorker factory
 */
function getDefaultWorkerOptions() {
  return {
    connection: getRedis(),
    concurrency: parseInt(process.env.QUEUE_WORKER_CONCURRENCY!, 10),
    removeOnComplete: { count: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE_COUNT!, 10) },
    removeOnFail: { count: parseInt(process.env.QUEUE_REMOVE_ON_FAIL_COUNT!, 10) },
  };
}

/**
 * Type-safe queue creation helper
 */
export function createQueue<T = unknown>(name: string) {
  return new Queue<T>(name, getDefaultQueueOptions());
}

/**
 * Type-safe worker creation helper with centralized error handling
 */
export function createWorker<T = unknown>(
  name: string,
  processor: (job: { data: T; id?: string }) => Promise<unknown>,
  options?: Partial<WorkerOptions>
) {
  const worker = new Worker<T>(
    name,
    async job => {
      try {
        console.log(`[WORKER] 🔄 Processing job: ${job.id}`);
        const result = await processor(job);
        console.log(`[WORKER] ✅ Job ${job.id} completed`);
        return result;
      } catch (error) {
        console.error(`[WORKER] ❌ Job ${job.id} failed:`, error);

        // Report to Sentry with context
        Sentry.captureException(error, {
          tags: {
            jobId: job.id,
            queueName: name,
          },
          extra: {
            jobData: job.data,
            attemptsMade: job.attemptsMade,
          },
        });

        throw error; // Re-throw to mark job as failed and trigger retry
      }
    },
    { ...getDefaultWorkerOptions(), ...options }
  );

  // Worker-level error handler for critical errors
  worker.on('error', error => {
    console.error(`[WORKER] 🚨 Worker error on ${name}:`, error);
    Sentry.captureException(error, {
      tags: {
        component: 'worker',
        queueName: name,
      },
    });
  });

  return worker;
}

/**
 * Create queue events listener for monitoring
 */
export function createQueueEvents(name: string) {
  return new QueueEvents(name, {
    connection: getRedis(),
  });
}

// ============================================================
// Build Cancellation Signal (Redis-based, cross-process)
// ============================================================

const CANCEL_KEY_PREFIX = 'build:cancel:';
const CANCEL_KEY_TTL = 3600; // 1 hour

/**
 * Signal that a build should be cancelled (set Redis key)
 */
export async function signalBuildCancel(buildJobId: string): Promise<void> {
  const redis = getRedis();
  await redis.set(`${CANCEL_KEY_PREFIX}${buildJobId}`, '1', 'EX', CANCEL_KEY_TTL);
  console.log(`[CANCEL] 📡 Cancel signal set for build ${buildJobId}`);
}

/**
 * Check if a build has been cancelled (check Redis key)
 */
export async function isBuildCancelled(buildJobId: string): Promise<boolean> {
  const redis = getRedis();
  const value = await redis.get(`${CANCEL_KEY_PREFIX}${buildJobId}`);
  return value === '1';
}

/**
 * Clear the cancel signal (after processing)
 */
export async function clearBuildCancelSignal(buildJobId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${CANCEL_KEY_PREFIX}${buildJobId}`);
}

/**
 * Graceful shutdown handler for workers and Redis connection
 * Call this when shutting down the application to ensure jobs are completed
 */
export async function gracefulShutdown(workers: Worker[], queues: Queue[] = []) {
  console.log('[WORKER] 🛑 Gracefully shutting down workers and queues...');

  // Close all workers first (stops accepting new jobs)
  await Promise.all(
    workers.map(async worker => {
      console.log(`[WORKER] 📛 Closing worker: ${worker.name}`);
      await worker.close();
    })
  );

  // Close all queues (closes Redis connections)
  await Promise.all(
    queues.map(async queue => {
      console.log(`[WORKER] 📛 Closing queue: ${queue.name}`);
      await queue.close();
    })
  );

  console.log('[WORKER] ✅ All workers and queues shut down successfully');

  // Close Redis connection after workers are closed
  const redisConn = getRedis();
  await redisConn.quit();
}
