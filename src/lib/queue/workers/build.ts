/**
 * Build Worker
 * Processes build jobs from BullMQ queue
 * Calls kosuke-cli build command via HTTP
 */

import { db } from '@/lib/db/drizzle';
import { buildJobs, tasks } from '@/lib/db/schema';
import { SandboxClient } from '@/lib/sandbox/client';
import { eq } from 'drizzle-orm';
import { createQueueEvents, createWorker } from '../client';
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
    enableReview,
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

  // Update build job status to running
  await db
    .update(buildJobs)
    .set({
      status: 'running',
      startedAt: new Date(),
    })
    .where(eq(buildJobs.id, buildJobId));

  const sandboxClient = new SandboxClient(projectId, sessionId);
  let totalCost = 0;
  let currentTicketCost = 0; // Track cost for current ticket

  try {
    // Call /api/build endpoint to execute build with existing tickets
    // This runs build phase independently (no plan phase needed)
    const buildUrl = `${sandboxClient.getBaseUrl()}/api/build`;

    console.log(`[BUILD] 🔗 Connecting to sandbox build API...`);
    console.log(`[BUILD]    URL: ${buildUrl}`);
    console.log(`[BUILD]    Review: ${enableReview ? 'enabled' : 'disabled'}`);
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
        dbUrl,
        reset: false,
        review: enableReview,
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

            // Log all events for maximum visibility
            switch (event.type) {
              case 'build_started':
                console.log('\n' + '='.repeat(80));
                console.log(
                  `[BUILD] 🏗️  Build started: ${event.data.totalTickets} tickets from ${event.data.ticketsFile}`
                );
                console.log('='.repeat(80) + '\n');
                break;

              case 'ticket_started':
                console.log('\n' + '='.repeat(80));
                console.log(
                  `[BUILD] 📦 Processing Ticket ${event.data.index}/${event.data.total}: ${event.data.ticket.id}`
                );
                console.log(`[BUILD] 📝 ${event.data.ticket.title}`);
                console.log(`[BUILD] 🏷️  Type: ${event.data.ticket.type || 'feature'}`);
                if (event.data.ticket.category) {
                  console.log(`[BUILD] 📂 Category: ${event.data.ticket.category}`);
                }
                console.log('='.repeat(80) + '\n');

                // Update task status to in_progress
                await db
                  .update(tasks)
                  .set({
                    status: 'in_progress',
                    updatedAt: new Date(),
                  })
                  .where(eq(tasks.taskId, event.data.ticket.id));
                break;

              case 'ticket_phase':
                const phaseEmojiMap: Record<string, string> = {
                  ship: '🚢',
                  test: '🧪',
                  migrate: '🗄️',
                  review: '🔍',
                };
                const phaseEmoji = phaseEmojiMap[event.data.phase] || '🔄';

                if (event.data.status === 'started') {
                  console.log('\n' + '-'.repeat(60));
                  console.log(
                    `[BUILD] ${phaseEmoji} Phase: ${event.data.phase.toUpperCase()} (${event.data.status})`
                  );
                  console.log('-'.repeat(60) + '\n');
                } else {
                  console.log(
                    `[BUILD] ${phaseEmoji} Phase ${event.data.phase.toUpperCase()}: ${event.data.status}\n`
                  );
                }
                break;

              // Ship phase events
              case 'ship_event':
                const shipEvent = event.data;
                if (shipEvent.type === 'tool_call') {
                  console.log(`[BUILD] 🔧 Ship tool: ${shipEvent.data.action}`);
                } else if (shipEvent.type === 'message') {
                  // Log ship messages for better visibility
                  if (shipEvent.data.text && shipEvent.data.text.length > 0) {
                    const text = shipEvent.data.text.substring(0, 150);
                    console.log(`[BUILD] 💭 ${text}${text.length >= 150 ? '...' : ''}`);
                  }
                } else if (shipEvent.type === 'done') {
                  const result = shipEvent.data;
                  console.log(`[BUILD] ✅ Ship completed successfully`);
                  console.log(
                    `[BUILD]    📊 Implementation fixes: ${result.implementationFixCount}`
                  );
                  console.log(`[BUILD]    🔧 Linting fixes: ${result.lintFixCount}`);
                  if (result.reviewFixCount > 0) {
                    console.log(`[BUILD]    🔍 Review fixes: ${result.reviewFixCount}`);
                  }
                  console.log(`[BUILD]    💰 Cost: $${result.cost.toFixed(4)}`);
                }
                break;

              case 'ship_phase':
                if (event.data.phase === 'implementation') {
                  console.log(`[BUILD] ℹ️  Implementation phase: ${event.data.status}`);
                  if (event.data.result) {
                    console.log(
                      `[BUILD]    Fixes applied: ${event.data.result.implementationFixCount || 0}`
                    );
                    // Track implementation cost
                    if (event.data.result.cost) {
                      currentTicketCost += event.data.result.cost;
                    }
                  }
                } else if (event.data.phase === 'linting') {
                  console.log(`[BUILD] ℹ️  Linting phase: ${event.data.status}`);
                  if (event.data.result) {
                    console.log(`[BUILD]    Lint fixes: ${event.data.result.lintFixCount || 0}`);
                    // Track linting cost
                    if (event.data.result.cost) {
                      currentTicketCost += event.data.result.cost;
                    }
                  }
                } else if (event.data.phase === 'review') {
                  console.log(`[BUILD] ℹ️  Review phase: ${event.data.status}`);
                  if (event.data.result) {
                    console.log(
                      `[BUILD]    Review fixes: ${event.data.result.reviewFixCount || 0}`
                    );
                    // Track review cost
                    if (event.data.result.cost) {
                      currentTicketCost += event.data.result.cost;
                    }
                  }
                }
                break;

              case 'ship_done':
                console.log(
                  `[BUILD] ℹ️  Ship completed: ${event.data.success ? 'success' : 'failed'}`
                );
                break;

              // Test phase events
              case 'test_event':
                const testEvent = event.data;
                if (testEvent.type === 'tool_call') {
                  console.log(`[BUILD] 🧪 Test tool: ${testEvent.data.action}`);
                } else if (testEvent.type === 'message') {
                  if (testEvent.data.text && testEvent.data.text.length > 0) {
                    const text = testEvent.data.text.substring(0, 150);
                    console.log(`[BUILD] 💭 ${text}${text.length >= 150 ? '...' : ''}`);
                  }
                } else if (testEvent.type === 'done') {
                  const result = testEvent.data;
                  console.log(
                    `[BUILD] ${result.success ? '✅' : '❌'} Test ${result.success ? 'passed' : 'failed'}`
                  );
                  console.log(`[BUILD]    💰 Cost: $${result.cost.toFixed(4)}`);
                  if (!result.success && result.error) {
                    console.log(`[BUILD]    ⚠️  Error: ${result.error}`);
                  }
                  // Add test cost to current ticket
                  currentTicketCost += result.cost || 0;
                }
                break;

              // Migrate phase events
              case 'migrate_event':
                const migrateEvent = event.data;
                if (migrateEvent.type === 'tool_call') {
                  console.log(`[BUILD] 🔧 Migrate tool: ${migrateEvent.data.action}`);
                } else if (migrateEvent.type === 'message') {
                  if (migrateEvent.data.text && migrateEvent.data.text.length > 0) {
                    const text = migrateEvent.data.text.substring(0, 150);
                    console.log(`[BUILD] 💭 ${text}${text.length >= 150 ? '...' : ''}`);
                  }
                } else if (migrateEvent.type === 'done') {
                  const result = migrateEvent.data;
                  console.log(
                    `[BUILD] ${result.success ? '✅' : '❌'} Migration ${result.success ? 'completed' : 'failed'}`
                  );
                  console.log(`[BUILD]    ✓ Migrations applied: ${result.migrationsApplied}`);
                  console.log(`[BUILD]    ✓ Seeding completed: ${result.seedingCompleted}`);
                  console.log(`[BUILD]    ✓ Validation passed: ${result.validationPassed}`);
                  console.log(`[BUILD]    💰 Cost: $${result.cost.toFixed(4)}`);
                  if (!result.success && result.error) {
                    console.log(`[BUILD]    ⚠️  Error: ${result.error}`);
                  }
                  // Add migrate cost to current ticket
                  currentTicketCost += result.cost || 0;
                }
                break;

              case 'migrate_migration_started':
                console.log(`[BUILD] 🗄️  Starting database migration`);
                console.log(
                  `[BUILD]    Database: ${event.data.dbUrl?.replace(/:[^:]+@/, ':****@')}`
                );
                break;

              case 'migrate_message':
                // Log migration messages for visibility
                if (event.data.message?.content) {
                  const content = Array.isArray(event.data.message.content)
                    ? event.data.message.content.find((c: { type: string }) => c.type === 'text')
                        ?.text
                    : event.data.message.content;

                  if (content && content.length > 0) {
                    const text = content.substring(0, 150);
                    console.log(`[BUILD] 💭 ${text}${text.length >= 150 ? '...' : ''}`);
                  }
                }
                break;

              case 'migrate_done':
                console.log(
                  `[BUILD] ℹ️  Migration phase: ${event.data.success ? 'completed' : 'failed'}`
                );
                break;

              case 'ticket_completed':
                const resultEmoji = event.data.result === 'success' ? '✅' : '❌';
                console.log('\n' + '-'.repeat(60));
                console.log(
                  `[BUILD] ${resultEmoji} Ticket ${event.data.result}: ${event.data.ticket.title}`
                );
                console.log(`[BUILD]    💰 Ticket Cost: $${currentTicketCost.toFixed(4)}`);
                console.log('-'.repeat(60) + '\n');

                // Update task status to done or error based on result, including cost
                const taskStatus = event.data.result === 'failed' ? 'error' : 'done';
                await db
                  .update(tasks)
                  .set({
                    status: taskStatus,
                    error:
                      event.data.result === 'failed'
                        ? event.data.ticket.error || 'Task failed'
                        : null,
                    cost: currentTicketCost,
                    updatedAt: new Date(),
                  })
                  .where(eq(tasks.taskId, event.data.ticket.id));
                break;

              case 'ticket_committed':
                console.log(`[BUILD] 💾 Committed: ${event.data.commitMessage}\n`);
                break;

              case 'progress':
                console.log(
                  `[BUILD] 📊 Progress: ${event.data.completed}/${event.data.total} tickets (${event.data.percentage}%)\n`
                );
                break;

              case 'done':
                if (event.data.totalCost) {
                  totalCost = event.data.totalCost;
                }
                console.log('\n' + '='.repeat(80));
                console.log(
                  `[BUILD] 🏁 Build Complete: ${event.data.ticketsSucceeded}/${event.data.ticketsProcessed} succeeded, ${event.data.ticketsFailed} failed`
                );
                console.log(`[BUILD] 💰 Total Cost: $${event.data.totalCost?.toFixed(4)}`);
                console.log(`[BUILD] 🔢 Token Usage:`);
                console.log(`[BUILD]    Input: ${event.data.tokensUsed?.input || 0}`);
                console.log(`[BUILD]    Output: ${event.data.tokensUsed?.output || 0}`);
                console.log(
                  `[BUILD]    Cache Creation: ${event.data.tokensUsed?.cacheCreation || 0}`
                );
                console.log(`[BUILD]    Cache Read: ${event.data.tokensUsed?.cacheRead || 0}`);
                console.log('='.repeat(80) + '\n');

                if (event.data.success === false) {
                  throw new Error(event.data.error || 'Build failed');
                }
                break;

              default:
                // Log unknown event types with full context for debugging
                console.log(
                  `[BUILD] ℹ️  ${event.type}: ${JSON.stringify(event.data).substring(0, 200)}${JSON.stringify(event.data).length > 200 ? '...' : ''}`
                );
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

    // Determine final status: failed if any tasks failed, otherwise completed
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

    // Update build job to failed
    await db
      .update(buildJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
      })
      .where(eq(buildJobs.id, buildJobId));

    // Re-throw so BullMQ treats this as a failed job
    throw error;
  }
}

/**
 * Build worker instance
 */
export const buildWorker = createWorker<BuildJobData>(QUEUE_NAMES.BUILD, processBuildJob, {
  concurrency: 1, // One build at a time per worker
});

/**
 * Queue events for monitoring
 */
const buildEvents = createQueueEvents(QUEUE_NAMES.BUILD);

buildEvents.on('completed', ({ jobId, returnvalue }) => {
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

buildEvents.on('failed', ({ jobId, failedReason }) => {
  console.error('\n' + '='.repeat(80));
  console.error(`[WORKER] ❌ Job ${jobId} failed`);
  console.error(`[WORKER]    Reason: ${failedReason}`);
  console.error('='.repeat(80) + '\n');
});

buildEvents.on('progress', ({ jobId, data }) => {
  console.log(`[WORKER] 📊 Job ${jobId} progress:`, data);
});

console.log('='.repeat(80));
console.log('[WORKER] 🚀 Build Worker Initialized');
console.log('[WORKER]    Queue: ' + QUEUE_NAMES.BUILD);
console.log('[WORKER]    Concurrency: 1');
console.log('[WORKER]    Ready to process build jobs');
console.log('='.repeat(80) + '\n');
