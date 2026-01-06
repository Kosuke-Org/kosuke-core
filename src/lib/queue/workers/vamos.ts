/**
 * Vamos Worker
 * Processes vamos jobs from BullMQ queue
 * Calls kosuke-cli vamos command via HTTP
 */

import { db } from '@/lib/db/drizzle';
import { vamosJobs } from '@/lib/db/schema';
import { SandboxClient } from '@/lib/sandbox/client';
import { eq } from 'drizzle-orm';
import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { VamosJobData, VamosJobResult } from '../queues/vamos';

/**
 * Process a vamos job by calling kosuke-cli vamos command
 */
async function processVamosJob(job: { data: VamosJobData }): Promise<VamosJobResult> {
  const { vamosJobId, projectId, sessionId, cwd, dbUrl, url, withTests, isolated, githubToken } =
    job.data;

  console.log('\n' + '='.repeat(80));
  console.log(`[VAMOS] 🚀 Starting vamos job ${vamosJobId}`);
  console.log(`[VAMOS] 📁 Project: ${projectId}`);
  console.log(`[VAMOS] 🔗 Session: ${sessionId}`);
  console.log(`[VAMOS] 🗄️  Database: ${dbUrl.replace(/:[^:]+@/, ':****@')}`);
  console.log(`[VAMOS] 🧪 With Tests: ${withTests}`);
  console.log(`[VAMOS] 🔒 Isolated: ${isolated}`);
  console.log('='.repeat(80) + '\n');

  // Update vamos job status to running
  await db
    .update(vamosJobs)
    .set({
      status: 'running',
      startedAt: new Date(),
    })
    .where(eq(vamosJobs.id, vamosJobId));

  const sandboxClient = new SandboxClient(sessionId);
  const logs: unknown[] = [];

  // Wait for sandbox agent to be ready
  console.log(`[VAMOS] ⏳ Waiting for sandbox agent to be ready...`);

  await db
    .update(vamosJobs)
    .set({ phase: 'Waiting for agent' })
    .where(eq(vamosJobs.id, vamosJobId));

  const isReady = await sandboxClient.waitForReady(30); // 30 seconds timeout

  if (!isReady) {
    throw new Error('Sandbox agent not ready after 30 seconds');
  }

  console.log(`[VAMOS] ✅ Sandbox agent is ready`);

  // Helper to save logs incrementally to the database
  // Batched to avoid too many DB writes - updates on significant events
  const saveLogsToDb = async () => {
    await db
      .update(vamosJobs)
      .set({ logs: JSON.stringify(logs) })
      .where(eq(vamosJobs.id, vamosJobId));
  };

  try {
    // Call /api/vamos endpoint to execute the full workflow
    const vamosUrl = `${sandboxClient.getBaseUrl()}/api/vamos`;

    console.log(`[VAMOS] 🔗 Connecting to sandbox vamos API...`);
    console.log(`[VAMOS]    URL: ${vamosUrl}\n`);

    const response = await fetch(vamosUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        cwd: cwd || '/app/project',
        dbUrl,
        url,
        withTests,
        isolated,
        githubToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      throw new Error(`Vamos request failed: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from vamos endpoint');
    }

    console.log(`[VAMOS] ✅ Connected to vamos API, streaming events...\n`);

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let stepsCompleted = 0;
    let ticketsProcessed = 0;
    let testsProcessed = 0;
    let messageCount = 0;

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
              case 'vamos_started':
                console.log('\n' + '='.repeat(80));
                console.log(`[VAMOS] 🏗️  Vamos started: mode=${event.data.mode}`);
                console.log(`[VAMOS] 🧪 With tests: ${event.data.withTests}`);
                console.log('='.repeat(80) + '\n');
                // Save initial logs to DB
                await saveLogsToDb();
                break;

              case 'step_started':
                console.log('\n' + '-'.repeat(60));
                console.log(
                  `[VAMOS] 📋 Step ${event.data.step}/${event.data.total}: ${event.data.name}`
                );
                console.log('-'.repeat(60) + '\n');

                // Update phase and save logs incrementally
                await db
                  .update(vamosJobs)
                  .set({
                    phase: event.data.name,
                    completedPhases: stepsCompleted,
                    totalPhases: event.data.total,
                    logs: JSON.stringify(logs),
                  })
                  .where(eq(vamosJobs.id, vamosJobId));
                break;

              case 'step_completed':
                stepsCompleted++;
                console.log(`[VAMOS] ✅ Step completed: ${event.data.name}\n`);

                // Update completed phases and save logs incrementally
                await db
                  .update(vamosJobs)
                  .set({
                    completedPhases: stepsCompleted,
                    logs: JSON.stringify(logs),
                  })
                  .where(eq(vamosJobs.id, vamosJobId));
                break;

              case 'step_skipped':
                console.log(
                  `[VAMOS] ⏭️  Step skipped: ${event.data.name} (${event.data.reason})\n`
                );
                // Save logs when step is skipped
                await saveLogsToDb();
                break;

              case 'ticket_started':
                console.log('\n' + '-'.repeat(40));
                console.log(
                  `[VAMOS] 🎫 Ticket ${event.data.index}/${event.data.total}: ${event.data.title}`
                );
                console.log('-'.repeat(40) + '\n');
                // Save logs when ticket starts
                await saveLogsToDb();
                break;

              case 'ticket_phase':
                const phaseEmoji =
                  event.data.status === 'completed'
                    ? '✅'
                    : event.data.status === 'skipped'
                      ? '⏭️'
                      : '🔄';
                console.log(`[VAMOS] ${phaseEmoji} ${event.data.phase}: ${event.data.status}`);
                break;

              case 'ticket_completed':
                ticketsProcessed++;
                const ticketEmoji = event.data.result === 'success' ? '✅' : '❌';
                console.log(`[VAMOS] ${ticketEmoji} Ticket result: ${event.data.result}\n`);
                // Save logs when ticket completes
                await saveLogsToDb();
                break;

              case 'test_started':
                console.log(
                  `[VAMOS] 🧪 Test ${event.data.index}/${event.data.total}: ${event.data.title}`
                );
                break;

              case 'test_retry':
                console.log(
                  `[VAMOS] 🔄 Test retry ${event.data.attempt}/${event.data.maxAttempts}`
                );
                break;

              case 'test_completed':
                testsProcessed++;
                const testEmoji = event.data.result === 'success' ? '✅' : '❌';
                console.log(
                  `[VAMOS] ${testEmoji} Test result: ${event.data.result} (${event.data.attempts} attempts)`
                );
                // Save logs when test completes
                await saveLogsToDb();
                break;

              case 'message':
                messageCount++;
                if (event.data.text && event.data.text.length > 0) {
                  const text = event.data.text.substring(0, 150);
                  console.log(`[VAMOS] 💭 ${text}${text.length >= 150 ? '...' : ''}`);
                }
                // Save logs every 10 messages to keep UI updated
                if (messageCount % 10 === 0) {
                  await saveLogsToDb();
                }
                break;

              case 'agent_log':
                // Format agent log based on type
                if (event.data.logType === 'tool_call') {
                  const action = event.data.action || 'Unknown';
                  const params = event.data.params || {};
                  let logMsg = '';

                  switch (action) {
                    case 'Read':
                      logMsg = `[AGENT]    📄 Reading ${params.path || 'file'}`;
                      break;
                    case 'Grep':
                      logMsg = `[AGENT]    🔍 Searching: ${params.pattern || 'pattern'}`;
                      break;
                    case 'Glob':
                      logMsg = `[AGENT]    📁 Finding: ${params.pattern || 'pattern'}`;
                      break;
                    case 'Write':
                      logMsg = `[AGENT]    ✍️  Writing ${params.path || 'file'}`;
                      break;
                    case 'Edit':
                      logMsg = `[AGENT]    ✏️  Editing ${params.path || 'file'}`;
                      break;
                    case 'Bash':
                      logMsg = `[AGENT]    💻 Running: ${params.command || 'command'}`;
                      break;
                    case 'Task':
                      logMsg = `[AGENT]    🤖 ${params.type || 'Task'}: ${params.description || ''}`;
                      break;
                    default:
                      logMsg = `[AGENT]    🔧 ${action}`;
                  }
                  console.log(logMsg);
                } else if (event.data.logType === 'message' && event.data.text) {
                  const text = event.data.text.substring(0, 150);
                  console.log(`[AGENT]    💭 ${text}${text.length >= 150 ? '...' : ''}`);
                }
                // Save logs every 5 agent events to keep UI updated
                messageCount++;
                if (messageCount % 5 === 0) {
                  await saveLogsToDb();
                }
                break;

              case 'error':
                console.error(`[VAMOS] ❌ Error: ${event.data.message}`);
                // Save logs immediately on error
                await saveLogsToDb();
                break;

              case 'done':
                console.log('\n' + '='.repeat(80));
                console.log(
                  `[VAMOS] 🏁 Vamos Complete: ${event.data.success ? 'SUCCESS' : 'FAILED'}`
                );
                console.log(`[VAMOS] 📊 Steps completed: ${event.data.stepsCompleted}`);
                if (event.data.error) {
                  console.log(`[VAMOS] ⚠️  Error: ${event.data.error}`);
                }
                console.log('='.repeat(80) + '\n');

                if (!event.data.success) {
                  throw new Error(event.data.error || 'Vamos workflow failed');
                }
                break;

              default:
                console.log(
                  `[VAMOS] ℹ️  ${event.type}: ${JSON.stringify(event.data).substring(0, 200)}`
                );
            }
          } catch (parseError) {
            if (
              parseError instanceof Error &&
              parseError.message.includes('Vamos workflow failed')
            ) {
              throw parseError;
            }
            console.warn('\n[VAMOS] ⚠️  Failed to parse SSE event');
            console.warn('[VAMOS]    Data:', eventData?.substring(0, 200));
          }
        }
      }
    }

    // Update vamos job to completed
    await db
      .update(vamosJobs)
      .set({
        status: 'completed',
        completedAt: new Date(),
        completedPhases: stepsCompleted,
        logs: JSON.stringify(logs),
      })
      .where(eq(vamosJobs.id, vamosJobId));

    console.log('\n' + '='.repeat(80));
    console.log(`[VAMOS] ✅ Vamos job ${vamosJobId} completed successfully`);
    console.log(`[VAMOS] 📊 Final Summary:`);
    console.log(`[VAMOS]    Steps completed: ${stepsCompleted}`);
    console.log(`[VAMOS]    Tickets processed: ${ticketsProcessed}`);
    console.log(`[VAMOS]    Tests processed: ${testsProcessed}`);
    console.log('='.repeat(80) + '\n');

    return {
      success: true,
      stepsCompleted,
      ticketsProcessed,
      testsProcessed,
      totalCost: 0, // Vamos doesn't track cost currently
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error(`[VAMOS] ❌ Vamos job ${vamosJobId} failed`);
    console.error(`[VAMOS] Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('='.repeat(80) + '\n');

    // Update vamos job to failed
    await db
      .update(vamosJobs)
      .set({
        status: 'failed',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
        logs: JSON.stringify(logs),
      })
      .where(eq(vamosJobs.id, vamosJobId));

    throw error;
  }
}

/**
 * Create and initialize vamos worker
 * Factory function - NO side effects until called
 */
export function createVamosWorker() {
  const worker = createWorker<VamosJobData>(QUEUE_NAMES.VAMOS, processVamosJob, {
    concurrency: 1, // One vamos job at a time per worker
  });

  const events = createQueueEvents(QUEUE_NAMES.VAMOS);

  events.on('completed', ({ jobId, returnvalue }) => {
    console.log('\n' + '='.repeat(80));
    console.log(`[WORKER] ✅ Vamos job ${jobId} completed`);
    if (returnvalue) {
      const result = returnvalue as unknown as VamosJobResult;
      console.log(`[WORKER]    Success: ${result.success}`);
      console.log(`[WORKER]    Steps: ${result.stepsCompleted}`);
    }
    console.log('='.repeat(80) + '\n');
  });

  events.on('failed', ({ jobId, failedReason }) => {
    console.error('\n' + '='.repeat(80));
    console.error(`[WORKER] ❌ Vamos job ${jobId} failed`);
    console.error(`[WORKER]    Reason: ${failedReason}`);
    console.error('='.repeat(80) + '\n');
  });

  console.log('='.repeat(80));
  console.log('[WORKER] 🚀 Vamos Worker Initialized');
  console.log('[WORKER]    Queue: ' + QUEUE_NAMES.VAMOS);
  console.log('[WORKER]    Concurrency: 1');
  console.log('[WORKER]    Ready to process vamos jobs');
  console.log('='.repeat(80) + '\n');

  return worker;
}
