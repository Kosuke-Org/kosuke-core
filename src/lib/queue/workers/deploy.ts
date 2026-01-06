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
    // Call /api/deploy endpoint to execute deployment
    const deployUrl = `${sandboxClient.getBaseUrl()}/api/deploy`;

    console.log(`[DEPLOY] 🔗 Connecting to sandbox deploy API...`);
    console.log(`[DEPLOY]    URL: ${deployUrl}\n`);

    const response = await fetch(deployUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        cwd: cwd || '/app/project',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      throw new Error(`Deploy request failed: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from deploy endpoint');
    }

    console.log(`[DEPLOY] ✅ Connected to deploy API, streaming events...\n`);

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || '';

      for (const message of messages) {
        const lines = message.split('\n');
        let eventType: string | null = null;
        let eventData: string | null = null;

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6).trim();
          }
        }

        if (eventData) {
          if (eventData === '[DONE]') break;

          try {
            const parsed = JSON.parse(eventData);
            const event = eventType ? { type: eventType, data: parsed } : parsed;

            // Store log event
            logs.push(event);

            // Log events for visibility
            switch (event.type) {
              case 'deploy_started':
                console.log('\n' + '='.repeat(80));
                console.log(`[DEPLOY] 🏗️  Deploy started: ${event.data.projectName}`);
                console.log('='.repeat(80) + '\n');
                break;

              case 'step_started':
                console.log('\n' + '-'.repeat(60));
                console.log(`[DEPLOY] 📋 Step: ${event.data.name}`);
                console.log('-'.repeat(60) + '\n');

                // Update current step in database
                await db
                  .update(deployJobs)
                  .set({ currentStep: event.data.name })
                  .where(eq(deployJobs.id, deployJobId));
                break;

              case 'step_completed':
                console.log(`[DEPLOY] ✅ Step completed: ${event.data.step}\n`);
                break;

              case 'storage_deploying':
                console.log(
                  `[DEPLOY] 🗄️  Deploying storage: ${event.data.name} (${event.data.type})`
                );
                break;

              case 'storage_deployed':
                console.log(
                  `[DEPLOY] ✅ Storage deployed: ${event.data.key} (ID: ${event.data.id})`
                );
                break;

              case 'storage_exists':
                console.log(
                  `[DEPLOY] ℹ️  Storage exists: ${event.data.key} (ID: ${event.data.id})`
                );
                break;

              case 'service_deploying':
                console.log(
                  `[DEPLOY] 🚀 Deploying service: ${event.data.name} (${event.data.type})`
                );
                break;

              case 'service_deployed':
                console.log(
                  `[DEPLOY] ✅ Service deployed: ${event.data.key} (ID: ${event.data.id})`
                );
                if (event.data.url) {
                  serviceUrls.push(event.data.url);
                  console.log(`[DEPLOY]    URL: ${event.data.url}`);
                }
                break;

              case 'service_exists':
                console.log(
                  `[DEPLOY] ℹ️  Service exists: ${event.data.key} (ID: ${event.data.id})`
                );
                if (event.data.url) {
                  serviceUrls.push(event.data.url);
                }
                break;

              case 'waiting_for_deployment':
                console.log(`[DEPLOY] ⏳ Waiting for deployment: ${event.data.serviceId}`);
                break;

              case 'deployment_ready':
                console.log(`[DEPLOY] ✅ Deployment ready: ${event.data.serviceId}`);
                break;

              case 'message':
                if (event.data.text && event.data.text.length > 0) {
                  const text = event.data.text.substring(0, 150);
                  console.log(`[DEPLOY] 💭 ${text}${text.length >= 150 ? '...' : ''}`);
                }
                break;

              case 'error':
                console.error(`[DEPLOY] ❌ Error: ${event.data.message}`);
                break;

              case 'done':
                console.log('\n' + '='.repeat(80));
                console.log(
                  `[DEPLOY] 🏁 Deploy Complete: ${event.data.success ? 'SUCCESS' : 'FAILED'}`
                );
                if (event.data.error) {
                  console.log(`[DEPLOY] ⚠️  Error: ${event.data.error}`);
                }
                console.log('='.repeat(80) + '\n');

                if (!event.data.success) {
                  throw new Error(event.data.error || 'Deployment failed');
                }
                break;

              default:
                console.log(
                  `[DEPLOY] ℹ️  ${event.type}: ${JSON.stringify(event.data).substring(0, 200)}`
                );
            }
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message.includes('Deployment failed')) {
              throw parseError;
            }
            console.warn('\n[DEPLOY] ⚠️  Failed to parse SSE event');
            console.warn('[DEPLOY]    Data:', eventData?.substring(0, 200));
          }
        }
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
    console.error(`[DEPLOY] ❌ Deploy job ${deployJobId} failed`);
    console.error(`[DEPLOY] Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('='.repeat(80) + '\n');

    // Update deploy job to failed
    await db
      .update(deployJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
        logs: JSON.stringify(logs),
      })
      .where(eq(deployJobs.id, deployJobId));

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
