import { db } from '@/lib/db/drizzle';
import { buildJobs, type TicketData } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { BuildJobData, BuildJobResult } from '../queues/build';

/**
 * Read tickets from tickets.json
 */
function readTicketsFile(ticketsPath: string): TicketData[] {
  try {
    const content = readFileSync(ticketsPath, 'utf-8');
    const data = JSON.parse(content);
    return data.tickets || [];
  } catch {
    return [];
  }
}

/**
 * Sync tickets from file to database
 */
async function syncTicketsToDb(buildJobId: string, ticketsPath: string) {
  const tickets = readTicketsFile(ticketsPath);

  const completed = tickets.filter(t => t.status === 'Done').length;
  const failed = tickets.filter(t => t.status === 'Error').length;
  const current = tickets.find(t => t.status === 'InProgress');

  await db
    .update(buildJobs)
    .set({
      tickets,
      completedTickets: completed,
      failedTickets: failed,
      currentTicketId: current?.id || null,
    })
    .where(eq(buildJobs.id, buildJobId));

  return { completed, failed, current };
}

/**
 * Build worker - processes build jobs
 *
 * Runs buildCommand and polls tickets.json for status updates.
 * No streaming - just runs the build and syncs progress to DB.
 */
export const buildWorker = createWorker<BuildJobData>(
  QUEUE_NAMES.BUILD,
  async job => {
    const {
      buildJobId,
      sessionPath,
      ticketsPath,
      tickets,
      dbUrl,
      githubToken,
      enableReview,
      testUrl,
    } = job.data;

    console.log(`[BUILD] 🔨 Starting build job ${buildJobId}`);

    // Set GITHUB_TOKEN for kosuke-cli build command
    process.env.GITHUB_TOKEN = githubToken;

    // Mark as running
    await db
      .update(buildJobs)
      .set({
        status: 'running',
        startedAt: new Date(),
        tickets,
        totalTickets: tickets.filter(t => t.status === 'Todo' || t.status === 'Error').length,
      })
      .where(eq(buildJobs.id, buildJobId));

    // Start polling tickets.json for updates
    let pollInterval: NodeJS.Timeout | null = null;

    try {
      // Import kosuke-cli build command
      const { buildCommand } = await import('@kosuke-ai/cli');

      // Start polling every 5 seconds
      pollInterval = setInterval(async () => {
        try {
          await syncTicketsToDb(buildJobId, ticketsPath);
        } catch (err) {
          console.error('[BUILD] Error syncing tickets:', err);
        }
      }, 5000);

      // Run the build command (blocking)
      // ticketsFile is relative to directory - extract "tickets/timestamp.ticket.json"
      const ticketsRelative = ticketsPath.includes('/tickets/')
        ? `tickets/${ticketsPath.split('/tickets/').pop()}`
        : ticketsPath.split('/').pop();

      await buildCommand({
        directory: sessionPath,
        ticketsFile: ticketsRelative,
        dbUrl,
        review: enableReview,
        test: !!testUrl,
        url: testUrl,
        noLogs: true, // Suppress CLI output
      });

      // Stop polling
      if (pollInterval) clearInterval(pollInterval);

      // Final sync
      const { completed, failed } = await syncTicketsToDb(buildJobId, ticketsPath);

      // Mark completed
      await db
        .update(buildJobs)
        .set({
          status: failed > 0 ? 'failed' : 'completed',
          completedAt: new Date(),
          currentTicketId: null,
        })
        .where(eq(buildJobs.id, buildJobId));

      const result: BuildJobResult = {
        success: failed === 0,
        completedTickets: completed,
        failedTickets: failed,
        totalCost: 0, // Cost tracking removed - would need to parse from tickets.json if needed
      };

      console.log(
        `[BUILD] ✅ Build job ${buildJobId} completed: ${completed} done, ${failed} failed`
      );
      return result;
    } catch (error) {
      // Stop polling
      if (pollInterval) clearInterval(pollInterval);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Final sync before marking failed
      await syncTicketsToDb(buildJobId, ticketsPath);

      await db
        .update(buildJobs)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorMessage,
          currentTicketId: null,
        })
        .where(eq(buildJobs.id, buildJobId));

      console.error(`[BUILD] ❌ Build job ${buildJobId} failed:`, errorMessage);
      throw error;
    }
  },
  {
    // Only one build at a time per worker
    concurrency: 1,
    // Long timeout for builds (2 hours)
    lockDuration: 2 * 60 * 60 * 1000,
  }
);

/**
 * Queue events for monitoring
 */
const buildEvents = createQueueEvents(QUEUE_NAMES.BUILD);

buildEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`[BUILD] ✅ Job ${jobId} completed:`, returnvalue);
});

buildEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`[BUILD] ❌ Job ${jobId} failed:`, failedReason);
});

console.log('[BUILD] 🚀 Worker initialized');
