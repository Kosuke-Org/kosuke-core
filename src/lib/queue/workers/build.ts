/**
 * Build Worker
 * Processes build jobs from BullMQ queue
 * Calls kosuke-cli build command via HTTP
 */

import { db } from '@/lib/db/drizzle';
import { buildJobs, tasks } from '@/lib/db/schema';
import { SandboxClient } from '@/lib/sandbox/client';
import {
  BUILD_EVENTS,
  MIGRATE_EVENTS,
  SHIP_EVENTS,
  TEST_EVENTS,
  formatBuildEvent,
  type BuildSSEEvent,
} from '@Kosuke-Org/cli';
import { and, eq, inArray } from 'drizzle-orm';
import {
  clearBuildCancelSignal,
  createQueueEvents,
  createWorker,
  isBuildCancelled,
} from '../client';
import { QUEUE_NAMES } from '../config';
import type { BuildJobData, BuildJobResult } from '../queues/build';

/**
 * Process a build job by calling kosuke-cli build command
 */
async function processBuildJob(job: { data: BuildJobData }): Promise<BuildJobResult> {
  const {
    buildJobId,
    projectId,
    sessionId,
    ticketsPath,
    dbUrl,
    githubToken,
    enableTest: _enableTest,
    testUrl,
  } = job.data;

  console.log('\n' + '='.repeat(80));
  console.log(`[BUILD] 🚀 Starting build job ${buildJobId}`);
  console.log(`[BUILD] 📁 Project: ${projectId}`);
  console.log(`[BUILD] 🔗 Session: ${sessionId}`);
  console.log(`[BUILD] 📋 Tickets: ${ticketsPath}`);
  console.log(`[BUILD] 🗄️  Database: ${dbUrl.replace(/:[^:]+@/, ':****@')}`);
  console.log('='.repeat(80) + '\n');

  // Update build job status to implementing and save tickets path
  await db
    .update(buildJobs)
    .set({
      status: 'running',
      startedAt: new Date(),
      ticketsPath,
    })
    .where(eq(buildJobs.id, buildJobId));

  const sandboxClient = new SandboxClient(sessionId);
  let totalCost = 0;
  let currentTicketCost = 0; // Track cost for current ticket

  try {
    // Call /api/build endpoint to execute build with existing tickets
    // This runs build phase independently (no plan phase needed)
    const buildUrl = `${sandboxClient.getBaseUrl()}/api/build`;

    console.log(`[BUILD] 🔗 Connecting to sandbox build API...`);
    console.log(`[BUILD]    URL: ${buildUrl}`);
    console.log(`[BUILD]    Test: ${_enableTest ? 'enabled' : 'disabled'}\n`);

    const response = await fetch(buildUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        cwd: '/app/project',
        ticketsFile: ticketsPath,
        buildId: buildJobId, // For cancellation tracking
        dbUrl,
        githubToken,
        reset: false,
        url: testUrl,
        headless: true,
        verbose: false,
        trace: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      throw new Error(`Build request failed: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from build endpoint');
    }

    console.log(`[BUILD] ✅ Connected to build API, streaming events...\n`);

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      // Check for cancel signal from Redis (cross-process)
      if (await isBuildCancelled(buildJobId)) {
        console.log('\n' + '='.repeat(80));
        console.log(`[BUILD] 🛑 Build job ${buildJobId} was cancelled`);
        console.log('='.repeat(80) + '\n');

        await reader.cancel();
        await clearBuildCancelSignal(buildJobId);

        // Only update cost (status and tasks already updated by cancelBuild())
        await db.update(buildJobs).set({ totalCost }).where(eq(buildJobs.id, buildJobId));

        console.log(`[BUILD] 💰 Cost before cancellation: $${totalCost.toFixed(4)}`);

        return {
          success: false,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          totalCost,
        };
      }

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
            const event = (eventType ? { type: eventType, data: parsed } : parsed) as BuildSSEEvent;

            // Log all events using centralized formatter
            for (const line of formatBuildEvent(event)) {
              console.log(`[BUILD] ${line}`);
            }

            // Handle database updates based on event type
            switch (event.type) {
              case BUILD_EVENTS.STARTED:
                // Save startCommit to build job for potential revert on cancel
                if (event.data.startCommit) {
                  await db
                    .update(buildJobs)
                    .set({ startCommit: event.data.startCommit })
                    .where(eq(buildJobs.id, buildJobId));
                }
                break;

              case BUILD_EVENTS.TICKET_STARTED:
                // Update task status to in_progress
                await db
                  .update(tasks)
                  .set({
                    status: 'in_progress',
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(tasks.buildJobId, buildJobId),
                      eq(tasks.externalId, event.data.ticket.id)
                    )
                  );
                break;

              case SHIP_EVENTS.PHASE:
                // Track implementation/linting cost
                if (event.data.result?.cost) {
                  currentTicketCost += event.data.result.cost;
                }
                break;

              case TEST_EVENTS.DONE:
                // Add test cost to current ticket
                currentTicketCost += event.data.cost || 0;
                break;

              case MIGRATE_EVENTS.DONE:
                // Add migrate cost to current ticket
                currentTicketCost += event.data.cost || 0;
                break;

              case BUILD_EVENTS.TICKET_COMPLETED:
                // Accumulate ticket cost into total
                totalCost += currentTicketCost;

                // Update task status to done or error based on result
                const taskStatus = event.data.result === 'failed' ? 'error' : 'done';
                await db
                  .update(tasks)
                  .set({
                    status: taskStatus,
                    error: event.data.result === 'failed' ? 'Task failed' : null,
                    cost: currentTicketCost,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(tasks.buildJobId, buildJobId),
                      eq(tasks.externalId, event.data.ticket.id)
                    )
                  );

                // Reset for next ticket
                currentTicketCost = 0;
                break;

              case BUILD_EVENTS.STOPPED:
                // Mark only pending/todo tasks as cancelled
                await db
                  .update(tasks)
                  .set({
                    status: 'cancelled',
                    error: 'Stopped due to previous failure',
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(tasks.buildJobId, buildJobId),
                      inArray(tasks.status, ['todo', 'in_progress'])
                    )
                  );
                break;

              case BUILD_EVENTS.LINT_STARTED:
                // Update status to 'validating'
                await db
                  .update(buildJobs)
                  .set({ status: 'validating' })
                  .where(eq(buildJobs.id, buildJobId));
                break;

              case BUILD_EVENTS.LINT_COMPLETED:
                // Update status to 'completed'
                await db
                  .update(buildJobs)
                  .set({ status: 'completed' })
                  .where(eq(buildJobs.id, buildJobId));
                break;

              case BUILD_EVENTS.DONE:
                // Use max of local and sandbox cost (handles cancellation where sandbox sends 0)
                const sandboxCost = event.data.totalCost || 0;
                totalCost = Math.max(totalCost, sandboxCost);

                if (event.data.success === false) {
                  throw new Error(event.data.error || 'Build failed');
                }
                break;
            }
          } catch (error) {
            console.warn('\n[BUILD] ⚠️  Failed to parse SSE event');
            console.warn('[BUILD]    Data:', eventData?.substring(0, 200));
            console.warn(
              '[BUILD]    Error:',
              error instanceof Error ? error.message : String(error)
            );
            console.warn('');
          }
        }
      }
    }

    // Get final task counts from database
    const allTasks = await db.select().from(tasks).where(eq(tasks.buildJobId, buildJobId));

    const totalCount = allTasks.length;
    const completedCount = allTasks.filter(t => t.status === 'done').length;
    const failedCount = allTasks.filter(t => t.status === 'error').length;

    // Determine final status: failed if any tasks failed, otherwise ready
    const finalStatus = failedCount > 0 ? 'failed' : 'completed';

    // Update build job to final status
    await db
      .update(buildJobs)
      .set({
        status: finalStatus,
        completedAt: new Date(),
        totalCost,
      })
      .where(eq(buildJobs.id, buildJobId));

    console.log('\n' + '='.repeat(80));
    if (failedCount > 0) {
      console.log(`[BUILD] ❌ Build job ${buildJobId} completed with failures`);
    } else {
      console.log(`[BUILD] ✅ Build job ${buildJobId} completed successfully`);
    }
    console.log(`[BUILD] 📊 Final Summary:`);
    console.log(`[BUILD]    Total tasks: ${totalCount}`);
    console.log(`[BUILD]    ✅ Completed: ${completedCount}`);
    console.log(`[BUILD]    ❌ Failed: ${failedCount}`);
    console.log(`[BUILD]    💰 Total Cost: $${totalCost.toFixed(4)}`);
    console.log('='.repeat(80) + '\n');

    return {
      success: failedCount === 0,
      totalTasks: totalCount,
      completedTasks: completedCount,
      failedTasks: failedCount,
      totalCost,
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error(`[BUILD] ❌ Build job ${buildJobId} failed`);
    console.error(`[BUILD] Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('='.repeat(80) + '\n');

    // Update build job to failed with accumulated cost
    await db
      .update(buildJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        totalCost,
      })
      .where(eq(buildJobs.id, buildJobId));

    // Re-throw so BullMQ treats this as a failed job
    throw error;
  }
}

/**
 * Create and initialize build worker
 * Factory function - NO side effects until called
 */
export function createBuildWorker() {
  const worker = createWorker<BuildJobData>(QUEUE_NAMES.BUILD, processBuildJob, {
    concurrency: 1, // One build at a time per worker
  });

  const events = createQueueEvents(QUEUE_NAMES.BUILD);

  events.on('completed', ({ jobId, returnvalue }) => {
    console.log('\n' + '='.repeat(80));
    console.log(`[WORKER] ✅ Job ${jobId} completed`);
    if (returnvalue) {
      const result = returnvalue as unknown as BuildJobResult;
      console.log(`[WORKER]    Success: ${result.success}`);
      console.log(`[WORKER]    Tasks: ${result.completedTasks}/${result.totalTasks}`);
      console.log(`[WORKER]    Cost: $${result.totalCost?.toFixed(4) || '0.0000'}`);
    }
    console.log('='.repeat(80) + '\n');
  });

  events.on('failed', ({ jobId, failedReason }) => {
    console.error('\n' + '='.repeat(80));
    console.error(`[WORKER] ❌ Job ${jobId} failed`);
    console.error(`[WORKER]    Reason: ${failedReason}`);
    console.error('='.repeat(80) + '\n');
  });

  events.on('progress', ({ jobId, data }) => {
    console.log(`[WORKER] 📊 Job ${jobId} progress:`, data);
  });

  console.log('='.repeat(80));
  console.log('[WORKER] 🚀 Build Worker Initialized');
  console.log('[WORKER]    Queue: ' + QUEUE_NAMES.BUILD);
  console.log('[WORKER]    Concurrency: 1');
  console.log('[WORKER]    Ready to process build jobs');
  console.log('='.repeat(80) + '\n');

  return worker;
}
