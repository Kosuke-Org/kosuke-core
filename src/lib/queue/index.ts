/**
 * BullMQ Queue Module
 */

export {
  clearBuildCancelSignal,
  createQueue,
  createQueueEvents,
  gracefulShutdown,
  isBuildCancelled,
  signalBuildCancel,
} from './client';
export { JOB_NAMES, QUEUE_NAMES } from './config';
export { buildQueue, type BuildJobData, type BuildJobResult } from './queues/build';
export { previewQueue, schedulePreviewCleanup } from './queues/previews';
export { submitQueue, type SubmitJobData, type SubmitJobResult } from './queues/submit';
export { createBuildWorker } from './workers/build';
export { createPreviewWorker } from './workers/previews';
export { createSubmitWorker } from './workers/submit';

export async function scheduleAllJobs() {
  const { schedulePreviewCleanup } = await import('./queues/previews');
  await schedulePreviewCleanup();
}

// ============================================================
// Build Queue Helpers
// ============================================================

/**
 * Options for canceling builds
 */
export interface CancelBuildOptions {
  /** Cancel a specific build job */
  buildJobId?: string;
  /** Cancel all builds for a chat session */
  chatSessionId?: string;
  /** Cancel all builds for a project */
  projectId?: string;
  /** SandboxClient for git reset (optional) */
  sandboxClient?: import('@/lib/sandbox/client').SandboxClient;
  /** GitHub token for pushing reset (required if sandboxClient provided) */
  githubToken?: string;
}

/**
 * Result of cancel operation
 */
export interface CancelBuildResult {
  /** Number of builds cancelled */
  cancelled: number;
  /** Commit SHA that was reverted to (if git reset was performed) */
  resetCommit?: string;
}

/**
 * Cancel active/pending builds
 *
 * - Removes jobs from BullMQ queue
 * - Updates build job status in DB to 'cancelled'
 * - Optionally resets git to startCommit if sandboxClient provided
 */
export async function cancelBuild(options: CancelBuildOptions): Promise<CancelBuildResult> {
  const { buildJobId, chatSessionId, projectId, sandboxClient, githubToken } = options;

  const { buildQueue } = await import('./queues/build');
  const { db } = await import('@/lib/db/drizzle');
  const { buildJobs, tasks } = await import('@/lib/db/schema');
  const { and, inArray, ne } = await import('drizzle-orm');

  let cancelled = 0;
  let resetCommit: string | undefined;

  // Get active and waiting jobs from queue
  const activeJobs = await buildQueue.getActive();
  const waitingJobs = await buildQueue.getWaiting();

  // Create sets for matching
  const activeJobIds = new Set(activeJobs.map(j => j.id));

  // Filter jobs based on criteria
  const allJobs = [...activeJobs, ...waitingJobs];
  const jobsToCancel = allJobs.filter(job => {
    if (buildJobId && job.data.buildJobId === buildJobId) return true;
    if (chatSessionId && job.data.chatSessionId === chatSessionId) return true;
    if (projectId && job.data.projectId === projectId) return true;
    return false;
  });

  // Collect build job IDs for database update
  const buildJobIds = jobsToCancel.map(job => job.data.buildJobId);

  // Import signal function for Redis-based cancellation
  const { signalBuildCancel } = await import('./client');

  // Remove/signal jobs from queue
  for (const job of jobsToCancel) {
    const isActive = activeJobIds.has(job.id);

    try {
      if (isActive) {
        // Active jobs - signal via Redis (cross-process)
        await signalBuildCancel(job.data.buildJobId);
        cancelled++;
        console.log(
          `[CANCEL] ✅ Signalled cancel for active job ${job.id} (buildJobId: ${job.data.buildJobId})`
        );
      } else {
        // Waiting jobs can be removed directly
        await job.remove();
        cancelled++;
        console.log(
          `[CANCEL] ✅ Removed job ${job.id} (buildJobId: ${job.data.buildJobId}) from queue`
        );
      }
    } catch (error) {
      console.warn(`[CANCEL] ⚠️  Failed to cancel job ${job.id}:`, error);
    }
  }

  // Update build job status in database to 'cancelled'
  if (buildJobIds.length > 0) {
    // Get the first build job with a startCommit for potential git reset
    const buildJobsWithStartCommit = await db
      .select({ id: buildJobs.id, startCommit: buildJobs.startCommit })
      .from(buildJobs)
      .where(
        and(
          inArray(buildJobs.id, buildJobIds),
          // Only get active builds
          inArray(buildJobs.status, ['pending', 'implementing', 'validating'])
        )
      );

    // Update all matching builds to cancelled
    await db
      .update(buildJobs)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
      })
      .where(
        and(
          inArray(buildJobs.id, buildJobIds),
          inArray(buildJobs.status, ['pending', 'implementing', 'validating'])
        )
      );

    // Mark all incomplete tasks for these builds as cancelled
    await db
      .update(tasks)
      .set({ status: 'cancelled' })
      .where(
        and(
          inArray(tasks.buildJobId, buildJobIds),
          ne(tasks.status, 'done'),
          ne(tasks.status, 'error')
        )
      );

    console.log(`[CANCEL] ✅ Updated ${buildJobIds.length} build job(s) to cancelled status`);

    // First, tell the sandbox to stop the build process
    if (sandboxClient) {
      for (const jobId of buildJobIds) {
        try {
          console.log(`[CANCEL] 🛑 Sending cancel signal to sandbox for build ${jobId}`);
          const cancelResult = await sandboxClient.cancelBuild(jobId);
          if (cancelResult.success) {
            console.log(`[CANCEL] ✅ Sandbox acknowledged cancel for build ${jobId}`);
          } else {
            console.warn(`[CANCEL] ⚠️  Sandbox cancel failed: ${cancelResult.error}`);
          }
        } catch (error) {
          console.warn(`[CANCEL] ⚠️  Failed to send cancel to sandbox:`, error);
        }
      }

      // Give the sandbox a moment to stop
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Perform git reset if sandboxClient and githubToken provided
    console.log(
      `[CANCEL] 🔍 Revert check: sandboxClient=${!!sandboxClient}, githubToken=${!!githubToken}, buildsWithCommit=${buildJobsWithStartCommit.length}`
    );
    if (buildJobsWithStartCommit.length > 0) {
      console.log(
        `[CANCEL] 🔍 Start commits: ${buildJobsWithStartCommit.map(b => b.startCommit?.substring(0, 8) || 'null').join(', ')}`
      );
    }

    if (sandboxClient && githubToken && buildJobsWithStartCommit.length > 0) {
      const firstBuildWithCommit = buildJobsWithStartCommit.find(b => b.startCommit);
      if (firstBuildWithCommit?.startCommit) {
        try {
          console.log(
            `[CANCEL] 🔄 Reverting to commit ${firstBuildWithCommit.startCommit.substring(0, 8)}`
          );
          const result = await sandboxClient.revert(firstBuildWithCommit.startCommit, githubToken);
          if (result.success) {
            resetCommit = firstBuildWithCommit.startCommit;
            console.log(`[CANCEL] ✅ Git reset and force push successful`);
          } else {
            console.warn(`[CANCEL] ⚠️  Git reset failed: ${result.error}`);
          }
        } catch (error) {
          console.error(`[CANCEL] ❌ Git reset error:`, error);
        }
      }
    }
  }

  return { cancelled, resetCommit };
}
