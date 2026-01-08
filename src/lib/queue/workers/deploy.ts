/**
 * Deploy Worker
 * Processes deploy jobs from BullMQ queue
 * Calls kosuke-cli deploy command via HTTP
 */

import { db } from '@/lib/db/drizzle';
import { deployJobs } from '@/lib/db/schema';
import { SandboxClient } from '@/lib/sandbox/client';
import { eq } from 'drizzle-orm';
import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { DeployJobData, DeployJobResult } from '../queues/deploy';

/**
 * Process a deploy job by calling kosuke-cli deploy command
 */
async function processDeployJob(job: { data: DeployJobData }): Promise<DeployJobResult> {
  const { deployJobId, projectId, sessionId, cwd } = job.data;

  console.log('\n' + '='.repeat(80));
  console.log(`[DEPLOY] 🚀 Starting deploy job ${deployJobId}`);
  console.log(`[DEPLOY] 📁 Project: ${projectId}`);
  console.log(`[DEPLOY] 🔗 Session: ${sessionId}`);
  console.log('='.repeat(80) + '\n');

  // Update deploy job status to running
  await db
    .update(deployJobs)
    .set({
      status: 'running',
      startedAt: new Date(),
    })
    .where(eq(deployJobs.id, deployJobId));

  const sandboxClient = new SandboxClient(sessionId);
  const logs: unknown[] = [];
  const serviceUrls: string[] = [];

  // Helper to save logs incrementally to the database
  // This allows the UI to show logs in real-time as events come in
  const saveLogsToDb = async () => {
    await db
      .update(deployJobs)
      .set({ logs: JSON.stringify(logs) })
      .where(eq(deployJobs.id, deployJobId));
  };

  // Wait for sandbox agent to be ready
  console.log(`[DEPLOY] ⏳ Waiting for sandbox agent to be ready...`);

  await db
    .update(deployJobs)
    .set({ currentStep: 'Waiting for agent' })
    .where(eq(deployJobs.id, deployJobId));

  const isReady = await sandboxClient.waitForReady(30); // 30 seconds timeout

  if (!isReady) {
    throw new Error('Sandbox agent not ready after 30 seconds');
  }

  console.log(`[DEPLOY] ✅ Sandbox agent is ready`);

  try {
    console.log(`[DEPLOY] 🔗 Connecting to sandbox deploy API...`);

    // Stream deploy events from sandbox using SandboxClient
    for await (const event of sandboxClient.streamDeploy(cwd || '/app/project')) {
      const eventType = event.type as string;
      const eventData = event.data as Record<string, unknown>;

      console.log(
        `[DEPLOY] 📦 Event: ${eventType} - ${JSON.stringify(eventData).substring(0, 300)}`
      );

      // Store log event
      logs.push(event);

      // Process events
      switch (eventType) {
        case 'deploy_started':
          console.log('\n' + '='.repeat(80));
          console.log(`[DEPLOY] 🏗️  Deploy started: ${eventData.projectName}`);
          console.log('='.repeat(80) + '\n');
          await saveLogsToDb();
          break;

        case 'step_started':
          console.log('\n' + '-'.repeat(60));
          console.log(`[DEPLOY] 📋 Step: ${eventData.name}`);
          console.log('-'.repeat(60) + '\n');

          // Update current step and save logs incrementally (matches vamos pattern)
          await db
            .update(deployJobs)
            .set({
              currentStep: String(eventData.name),
              logs: JSON.stringify(logs),
            })
            .where(eq(deployJobs.id, deployJobId));
          break;

        case 'step_completed':
          console.log(`[DEPLOY] ✅ Step completed: ${eventData.step}\n`);
          await saveLogsToDb();
          break;

        case 'storage_deploying':
          console.log(`[DEPLOY] 🗄️  Deploying storage: ${eventData.name} (${eventData.type})`);
          break;

        case 'storage_deployed':
          console.log(`[DEPLOY] ✅ Storage deployed: ${eventData.key} (ID: ${eventData.id})`);
          await saveLogsToDb();
          break;

        case 'storage_exists':
          console.log(`[DEPLOY] ℹ️  Storage exists: ${eventData.key} (ID: ${eventData.id})`);
          await saveLogsToDb();
          break;

        case 'service_deploying':
          console.log(`[DEPLOY] 🚀 Deploying service: ${eventData.name} (${eventData.type})`);
          break;

        case 'service_deployed':
          console.log(`[DEPLOY] ✅ Service deployed: ${eventData.key} (ID: ${eventData.id})`);
          if (eventData.url) {
            serviceUrls.push(String(eventData.url));
            console.log(`[DEPLOY]    URL: ${eventData.url}`);
          }
          await saveLogsToDb();
          break;

        case 'service_exists':
          console.log(`[DEPLOY] ℹ️  Service exists: ${eventData.key} (ID: ${eventData.id})`);
          if (eventData.url) {
            serviceUrls.push(String(eventData.url));
          }
          await saveLogsToDb();
          break;

        case 'waiting_for_deployment':
          console.log(`[DEPLOY] ⏳ Waiting for deployment: ${eventData.serviceId}`);
          await saveLogsToDb();
          break;

        case 'deployment_ready':
          console.log(`[DEPLOY] ✅ Deployment ready: ${eventData.serviceId}`);
          await saveLogsToDb();
          break;

        case 'message':
          if (eventData.text && String(eventData.text).length > 0) {
            const text = String(eventData.text).substring(0, 150);
            console.log(`[DEPLOY] 💭 ${text}${text.length >= 150 ? '...' : ''}`);
          }
          break;

        case 'error':
          console.error(`[DEPLOY] ❌ Error event received`);
          console.error(`[DEPLOY] ❌ Error data: ${JSON.stringify(eventData).substring(0, 500)}`);
          await saveLogsToDb();
          break;

        case 'done':
          console.log('\n' + '='.repeat(80));
          console.log(`[DEPLOY] 🏁 Deploy Complete: ${eventData.success ? 'SUCCESS' : 'FAILED'}`);
          console.log(
            `[DEPLOY] 📊 Done event data: ${JSON.stringify(eventData).substring(0, 500)}`
          );
          if (eventData.error) {
            console.log(`[DEPLOY] ⚠️  Error: ${eventData.error}`);
          }
          console.log('='.repeat(80) + '\n');

          if (!eventData.success) {
            const errorMsg = eventData.error || 'Deployment failed';
            console.log(`[DEPLOY] ❌ Throwing error from done event: ${errorMsg}`);
            throw new Error(String(errorMsg));
          }
          break;

        default:
          console.log(`[DEPLOY] ℹ️  ${eventType}: ${JSON.stringify(eventData).substring(0, 200)}`);
      }
    }

    // Update deploy job to completed
    await db
      .update(deployJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        deployedServices: JSON.stringify(serviceUrls),
        logs: JSON.stringify(logs),
      })
      .where(eq(deployJobs.id, deployJobId));

    console.log('\n' + '='.repeat(80));
    console.log(`[DEPLOY] ✅ Deploy job ${deployJobId} completed successfully`);
    console.log(`[DEPLOY] 📊 Final Summary:`);
    console.log(`[DEPLOY]    Service URLs: ${serviceUrls.length}`);
    serviceUrls.forEach((url, i) => {
      console.log(`[DEPLOY]    ${i + 1}. ${url}`);
    });
    console.log('='.repeat(80) + '\n');

    return {
      success: true,
      serviceUrls,
      totalCost: 0, // Deploy doesn't track cost
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error(`[DEPLOY] ❌ Deploy job ${deployJobId} CAUGHT ERROR`);
    console.error(`[DEPLOY] Error type: ${error?.constructor?.name}`);
    console.error(
      `[DEPLOY] Error message: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error(`[DEPLOY] Error stack: ${error instanceof Error ? error.stack : 'N/A'}`);
    console.error(`[DEPLOY] Logs collected so far: ${logs.length}`);
    console.error('='.repeat(80) + '\n');

    // Update deploy job to failed
    console.log(`[DEPLOY] 📝 Updating job ${deployJobId} to status=failed`);
    await db
      .update(deployJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
        logs: JSON.stringify(logs),
      })
      .where(eq(deployJobs.id, deployJobId));
    console.log(`[DEPLOY] ✅ Job ${deployJobId} updated to failed`);

    throw error;
  }
}

/**
 * Create and initialize deploy worker
 * Factory function - NO side effects until called
 */
export function createDeployWorker() {
  const worker = createWorker<DeployJobData>(QUEUE_NAMES.DEPLOY, processDeployJob, {
    concurrency: 1, // One deploy job at a time per worker
  });

  const events = createQueueEvents(QUEUE_NAMES.DEPLOY);

  events.on('completed', ({ jobId, returnvalue }) => {
    console.log('\n' + '='.repeat(80));
    console.log(`[WORKER] ✅ Deploy job ${jobId} completed`);
    if (returnvalue) {
      const result = returnvalue as unknown as DeployJobResult;
      console.log(`[WORKER]    Success: ${result.success}`);
      console.log(`[WORKER]    Service URLs: ${result.serviceUrls.length}`);
    }
    console.log('='.repeat(80) + '\n');
  });

  events.on('failed', ({ jobId, failedReason }) => {
    console.error('\n' + '='.repeat(80));
    console.error(`[WORKER] ❌ Deploy job ${jobId} failed`);
    console.error(`[WORKER]    Reason: ${failedReason}`);
    console.error('='.repeat(80) + '\n');
  });

  console.log('='.repeat(80));
  console.log('[WORKER] 🚀 Deploy Worker Initialized');
  console.log('[WORKER]    Queue: ' + QUEUE_NAMES.DEPLOY);
  console.log('[WORKER]    Concurrency: 1');
  console.log('[WORKER]    Ready to process deploy jobs');
  console.log('='.repeat(80) + '\n');

  return worker;
}
