/**
 * Maintenance Worker
 * Processes maintenance jobs from BullMQ queue
 * Calls the CLI maintenance command which handles branch creation, commits, and PR opening
 * The existing PR-to-chat-session sync creates the chat session when the PR is opened
 */

import { db } from '@/lib/db/drizzle';
import { maintenanceJobRuns, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { MaintenanceJobData, MaintenanceJobResult } from '../queues/maintenance';

/**
 * Get job display name for logging
 */
function getJobDisplayName(jobType: string): string {
  switch (jobType) {
    case 'sync_rules':
      return 'Sync Rules';
    case 'code_analysis':
      return 'Code Analysis';
    case 'security_check':
      return 'Security Check';
    default:
      return jobType;
  }
}

/**
 * Process a maintenance job
 */
async function processMaintenanceJob(job: {
  data: MaintenanceJobData;
}): Promise<MaintenanceJobResult> {
  const { maintenanceJobId, projectId, jobType } = job.data;

  console.log('\n' + '='.repeat(80));
  console.log(`[MAINTENANCE] 🚀 Starting ${getJobDisplayName(jobType)} job`);
  console.log(`[MAINTENANCE] 📁 Project: ${projectId}`);
  console.log(`[MAINTENANCE] 🔧 Job ID: ${maintenanceJobId}`);
  console.log('='.repeat(80) + '\n');

  // Create a run record
  const [run] = await db
    .insert(maintenanceJobRuns)
    .values({
      maintenanceJobId,
      status: 'pending',
    })
    .returning();

  try {
    // Get project details
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Skip archived projects - they're soft-deleted
    if (project.isArchived) {
      console.log(`[MAINTENANCE] ⏭️ Skipping archived project: ${projectId}`);

      // Mark run as completed with skip message
      await db
        .update(maintenanceJobRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
          summary: 'Skipped: Project is archived',
        })
        .where(eq(maintenanceJobRuns.id, run.id));

      return {
        success: true,
        runId: run.id,
        summary: 'Skipped: Project is archived',
      };
    }

    if (!project.githubOwner || !project.githubRepoName) {
      throw new Error('Project is not connected to a GitHub repository');
    }

    // Update run status to running
    await db
      .update(maintenanceJobRuns)
      .set({
        status: 'running',
        startedAt: new Date(),
      })
      .where(eq(maintenanceJobRuns.id, run.id));

    console.log(`[MAINTENANCE] 📝 Created run: ${run.id}`);
    console.log(`[MAINTENANCE] 🏃 Status: running`);

    // Call the CLI maintenance endpoint
    // The CLI handles: branch creation, commits, PR opening
    // Returns: success/failure, PR URL, summary
    const cliResult = await callMaintenanceEndpoint(projectId, jobType);

    if (cliResult.success) {
      console.log(`[MAINTENANCE] ✅ ${getJobDisplayName(jobType)} completed successfully`);
      if (cliResult.prUrl) {
        console.log(`[MAINTENANCE] 🔀 PR created: ${cliResult.prUrl}`);
      }

      // Update run with success
      await db
        .update(maintenanceJobRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
          summary: cliResult.summary,
          pullRequestUrl: cliResult.prUrl,
          pullRequestNumber: cliResult.prNumber,
        })
        .where(eq(maintenanceJobRuns.id, run.id));

      return {
        success: true,
        runId: run.id,
        pullRequestUrl: cliResult.prUrl,
        summary: cliResult.summary,
      };
    } else {
      throw new Error(cliResult.error || 'Maintenance job failed');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[MAINTENANCE] ❌ Job failed: ${errorMessage}`);

    await db
      .update(maintenanceJobRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        error: errorMessage,
      })
      .where(eq(maintenanceJobRuns.id, run.id));

    return {
      success: false,
      runId: run.id,
      error: errorMessage,
    };
  }
}

/**
 * Call the CLI maintenance endpoint
 * Currently calls a fake endpoint that simulates 30 seconds of work
 * In the future, this will call the real CLI maintenance command
 */
async function callMaintenanceEndpoint(
  projectId: string,
  jobType: string
): Promise<{
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  summary?: string;
  error?: string;
}> {
  try {
    // Temporary hardcoded URL for fake maintenance endpoint (will be replaced with real CLI)
    const url = 'http://nextjs:3000/api/maintenance';

    console.log(`[MAINTENANCE] 🔗 Calling CLI endpoint: ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ projectId, jobType }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `CLI request failed: ${response.status} - ${text}` };
    }

    if (!response.body) {
      return { success: false, error: 'No response body from CLI endpoint' };
    }

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: {
      success: boolean;
      prUrl?: string;
      prNumber?: number;
      summary?: string;
      error?: string;
    } = { success: false };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || '';

      for (const message of messages) {
        if (!message.startsWith('data: ')) continue;

        const data = message.slice(6).trim();
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === 'progress') {
            console.log(`[MAINTENANCE] 📊 ${parsed.message}`);
          } else if (parsed.type === 'done') {
            result = {
              success: parsed.success,
              prUrl: parsed.prUrl,
              prNumber: parsed.prNumber,
              summary: parsed.summary,
              error: parsed.error,
            };
          }
        } catch {
          // Ignore parse errors for progress messages
        }
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Create and initialize maintenance worker
 * Factory function - NO side effects until called
 */
export function createMaintenanceWorker() {
  if (!process.env.MAINTENANCE_WORKER_CONCURRENCY) {
    throw new Error('MAINTENANCE_WORKER_CONCURRENCY environment variable is required');
  }
  const concurrency = parseInt(process.env.MAINTENANCE_WORKER_CONCURRENCY, 10);
  const worker = createWorker<MaintenanceJobData>(QUEUE_NAMES.MAINTENANCE, processMaintenanceJob, {
    concurrency,
  });

  const events = createQueueEvents(QUEUE_NAMES.MAINTENANCE);

  events.on('completed', ({ jobId, returnvalue }) => {
    console.log('\n' + '='.repeat(80));
    console.log(`[WORKER] ✅ Maintenance job ${jobId} completed`);
    if (returnvalue) {
      const result = returnvalue as unknown as MaintenanceJobResult;
      console.log(`[WORKER]    Success: ${result.success}`);
      if (result.pullRequestUrl) {
        console.log(`[WORKER]    PR: ${result.pullRequestUrl}`);
      }
    }
    console.log('='.repeat(80) + '\n');
  });

  events.on('failed', ({ jobId, failedReason }) => {
    console.error('\n' + '='.repeat(80));
    console.error(`[WORKER] ❌ Maintenance job ${jobId} failed`);
    console.error(`[WORKER]    Reason: ${failedReason}`);
    console.error('='.repeat(80) + '\n');
  });

  events.on('progress', ({ jobId, data }) => {
    console.log(`[WORKER] 📊 Maintenance job ${jobId} progress:`, data);
  });

  console.log('='.repeat(80));
  console.log('[WORKER] 🚀 Maintenance Worker Initialized');
  console.log('[WORKER]    Queue: ' + QUEUE_NAMES.MAINTENANCE);
  console.log('[WORKER]    Concurrency: ' + concurrency);
  console.log('[WORKER]    Ready to process maintenance jobs');
  console.log('='.repeat(80) + '\n');

  return worker;
}
