/**
 * Maintenance Worker
 * Processes maintenance jobs from BullMQ queue
 * Creates a temporary sandbox, calls the CLI maintenance endpoint, then destroys the sandbox
 */

import { db } from '@/lib/db/drizzle';
import { maintenanceJobRuns, projects } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { SandboxClient } from '@/lib/sandbox/client';
import { getSandboxManager } from '@/lib/sandbox/manager';
import { snakeToText } from '@/lib/utils';
import { eq } from 'drizzle-orm';
import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type {
  MaintenanceCliResult,
  MaintenanceJobData,
  MaintenanceJobResult,
} from '../queues/maintenance';

/**
 * Process a maintenance job
 */
async function processMaintenanceJob(job: {
  data: MaintenanceJobData;
}): Promise<MaintenanceJobResult> {
  const { maintenanceJobId, projectId, jobType } = job.data;
  const jobName = snakeToText(jobType);

  console.log('\n' + '='.repeat(80));
  console.log(`[MAINTENANCE] 🚀 Starting ${jobName} job`);
  console.log(`[MAINTENANCE] 📁 Project: ${projectId}`);
  console.log(`[MAINTENANCE] 🔧 Job ID: ${maintenanceJobId}`);
  console.log('='.repeat(80) + '\n');

  const [run] = await db
    .insert(maintenanceJobRuns)
    .values({ maintenanceJobId, status: 'pending' })
    .returning();

  try {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (project.isArchived) {
      console.log(`[MAINTENANCE] ⏭️ Skipping archived project: ${projectId}`);
      await updateRunStatus(run.id, 'completed', { summary: 'Skipped: Project is archived' });
      return { success: true, runId: run.id, summary: 'Skipped: Project is archived' };
    }

    if (!project.githubOwner || !project.githubRepoName) {
      throw new Error('Project is not connected to a GitHub repository');
    }

    await updateRunStatus(run.id, 'running');
    console.log(`[MAINTENANCE] 📝 Created run: ${run.id}`);

    const cliResult = await callMaintenanceEndpoint(
      {
        id: project.id,
        orgId: project.orgId,
        githubOwner: project.githubOwner,
        githubRepoName: project.githubRepoName,
        defaultBranch: project.defaultBranch,
        githubInstallationId: project.githubInstallationId,
      },
      jobType,
      run.id
    );

    if (cliResult.success) {
      console.log(`[MAINTENANCE] ✅ ${jobName} completed successfully`);
      if (cliResult.pullRequestUrl) {
        console.log(`[MAINTENANCE] 🔀 PR created: ${cliResult.pullRequestUrl}`);
      }

      await updateRunStatus(run.id, 'completed', {
        summary: cliResult.summary,
        pullRequestUrl: cliResult.pullRequestUrl,
        pullRequestNumber: cliResult.pullRequestNumber,
      });

      return {
        success: true,
        runId: run.id,
        pullRequestUrl: cliResult.pullRequestUrl,
        summary: cliResult.summary,
      };
    }

    throw new Error(cliResult.error || 'Maintenance job failed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[MAINTENANCE] ❌ Job failed: ${errorMessage}`);
    await updateRunStatus(run.id, 'failed', { error: errorMessage });
    return { success: false, runId: run.id, error: errorMessage };
  }
}

/**
 * Update maintenance job run status
 */
async function updateRunStatus(
  runId: string,
  status: 'running' | 'completed' | 'failed',
  data?: {
    summary?: string;
    pullRequestUrl?: string;
    pullRequestNumber?: number;
    error?: string;
  }
) {
  await db
    .update(maintenanceJobRuns)
    .set({
      status,
      ...(status === 'running' && { startedAt: new Date() }),
      ...(status !== 'running' && { completedAt: new Date() }),
      ...data,
    })
    .where(eq(maintenanceJobRuns.id, runId));
}

/**
 * Project data needed for sandbox creation
 */
interface ProjectForSandbox {
  id: string;
  orgId: string | null;
  githubOwner: string;
  githubRepoName: string;
  defaultBranch: string | null;
  githubInstallationId: number | null;
}

/**
 * Call the CLI maintenance endpoint via a temporary sandbox
 */
async function callMaintenanceEndpoint(
  project: ProjectForSandbox,
  jobType: string,
  runId: string
): Promise<MaintenanceCliResult> {
  const sandboxManager = getSandboxManager();
  const tempSessionId = `maintenance-${runId}`;

  try {
    const githubToken = await getProjectGitHubToken(project);
    if (!githubToken) {
      return { success: false, error: 'Failed to get GitHub token for project' };
    }

    const repoUrl = `https://github.com/${project.githubOwner}/${project.githubRepoName}.git`;
    const baseBranch = project.defaultBranch || 'main';

    console.log(`[MAINTENANCE] 🐳 Creating temporary sandbox: ${tempSessionId}`);
    console.log(`[MAINTENANCE]    Repo: ${repoUrl}`);
    console.log(`[MAINTENANCE]    Branch: ${baseBranch}`);

    // createSandbox waits for agent to be ready before returning
    await sandboxManager.createSandbox({
      sessionId: tempSessionId,
      projectId: project.id,
      orgId: project.orgId ?? undefined,
      repoUrl,
      branchName: baseBranch,
      githubToken,
      mode: 'development',
    });

    const sandboxClient = new SandboxClient(tempSessionId);
    const url = `${sandboxClient.getBaseUrl()}/api/maintenance`;

    console.log(`[MAINTENANCE] 🔗 Calling CLI endpoint: ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cwd: '/app/project',
        jobType,
        githubToken,
        baseBranch,
        // Pipeline always creates PR, review is optional
        review: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `CLI request failed: ${response.status} - ${text}` };
    }

    const result = (await response.json()) as MaintenanceCliResult;
    return result;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    console.log(`[MAINTENANCE] 🧹 Cleaning up temporary sandbox: ${tempSessionId}`);
    try {
      await sandboxManager.destroySandbox(tempSessionId);
      console.log(`[MAINTENANCE] ✅ Sandbox destroyed`);
    } catch (cleanupError) {
      console.error(`[MAINTENANCE] ⚠️ Failed to destroy sandbox:`, cleanupError);
    }
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
