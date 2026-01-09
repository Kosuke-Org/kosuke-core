/**
 * Standalone BullMQ Worker Process
 *
 * This file runs as a separate process/container dedicated to processing background jobs.
 * Separating workers from the web server allows independent scaling and better resource isolation.
 *
 * Usage:
 *   - Development: bun run workers:dev
 *   - Production: bun run workers:start
 */

import { gracefulShutdown } from '@/lib/queue/client';
import { buildQueue } from '@/lib/queue/queues/build';
import { deployQueue } from '@/lib/queue/queues/deploy';
import { previewQueue, schedulePreviewCleanup } from '@/lib/queue/queues/previews';
import { submitQueue } from '@/lib/queue/queues/submit';
import { vamosQueue } from '@/lib/queue/queues/vamos';
import { createBuildWorker } from '@/lib/queue/workers/build';
import { createDeployWorker } from '@/lib/queue/workers/deploy';
import { createPreviewWorker } from '@/lib/queue/workers/previews';
import { createSubmitWorker } from '@/lib/queue/workers/submit';
import { createVamosWorker } from '@/lib/queue/workers/vamos';

async function main() {
  console.log('[WORKER] 🚀 Starting BullMQ worker process...\n');

  try {
    // Schedule all recurring jobs (idempotent - safe to call multiple times)
    await schedulePreviewCleanup();

    // Initialize workers (explicit - no side effects on import)
    const previewWorker = createPreviewWorker();
    const buildWorker = createBuildWorker();
    const vamosWorker = createVamosWorker();
    const deployWorker = createDeployWorker();
    const submitWorker = createSubmitWorker();

    console.log('[WORKER] ✅ Worker process initialized and ready');
    console.log('[WORKER] 📊 Active workers:');
    console.log('[WORKER]   - Preview Cleanup (concurrency: 1)');
    console.log('[WORKER]   - Build (concurrency: 1)');
    console.log('[WORKER]   - Vamos (concurrency: 1)');
    console.log('[WORKER]   - Deploy (concurrency: 1)');
    console.log('[WORKER]   - Submit (concurrency: 1)\n');

    // Store references for graceful shutdown
    const workers = [previewWorker, buildWorker, vamosWorker, deployWorker, submitWorker];
    const queues = [previewQueue, buildQueue, vamosQueue, deployQueue, submitQueue];

    // Graceful shutdown handlers
    process.on('SIGTERM', async () => {
      console.log('[WORKER] 📛 Received SIGTERM, shutting down gracefully...');
      await gracefulShutdown(workers, queues);
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('[WORKER] 📛 Received SIGINT, shutting down gracefully...');
      await gracefulShutdown(workers, queues);
      process.exit(0);
    });
  } catch (error) {
    console.error('[WORKER] ❌ Failed to start worker:', error);
    process.exit(1);
  }
}

main();
