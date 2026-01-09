/**
 * Submit Worker
 * Processes submit jobs from BullMQ queue
 * Calls kosuke-cli submit command via HTTP (review → commit → PR)
 */

import { db } from '@/lib/db/drizzle';
import { buildJobs, chatSessions } from '@/lib/db/schema';
import { logSubmitEvent } from '@/lib/logging';
import { SandboxClient } from '@/lib/sandbox/client';
import { SUBMIT_EVENTS, type SubmitSSEEvent } from '@Kosuke-Org/cli';
import { eq } from 'drizzle-orm';
import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { SubmitJobData, SubmitJobResult } from '../queues/submit';

/**
 * Process a submit job by calling kosuke-cli submit endpoint
 */
async function processSubmitJob(job: { data: SubmitJobData }): Promise<SubmitJobResult> {
  const {
    buildJobId,
    chatSessionId,
    sessionId,
    ticketsPath,
    githubToken,
    baseBranch,
    title,
    userEmail,
  } = job.data;

  console.log('\n' + '='.repeat(80));
  console.log(`[SUBMIT] 🚀 Starting submit job for build ${buildJobId}`);
  console.log(`[SUBMIT] 🔗 Session: ${sessionId}`);
  console.log('='.repeat(80) + '\n');

  // Update build job submit status to reviewing
  await db.update(buildJobs).set({ submitStatus: 'reviewing' }).where(eq(buildJobs.id, buildJobId));

  const sandboxClient = new SandboxClient(sessionId);

  try {
    // Call /api/submit endpoint
    const submitUrl = `${sandboxClient.getBaseUrl()}/api/submit`;

    console.log(`[SUBMIT] 🔗 Connecting to sandbox submit API...`);
    console.log(`[SUBMIT]    URL: ${submitUrl}`);

    const response = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        cwd: '/app/project',
        ticketsFile: ticketsPath,
        githubToken,
        baseBranch: baseBranch || 'main',
        title,
        userEmail,
        verbose: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details');
      throw new Error(`Submit request failed: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from submit endpoint');
    }

    console.log(`[SUBMIT] ✅ Connected to submit API, streaming events...\n`);

    // Parse SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let prUrl: string | undefined;

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

        if (eventData && eventType) {
          try {
            const parsed = JSON.parse(eventData);
            const event = { type: eventType, data: parsed } as SubmitSSEEvent;

            // Log all events using centralized formatter
            logSubmitEvent(event);

            // Handle database updates based on event type
            switch (event.type) {
              case SUBMIT_EVENTS.REVIEW_STARTED:
                await db
                  .update(buildJobs)
                  .set({ submitStatus: 'reviewing' })
                  .where(eq(buildJobs.id, buildJobId));
                break;

              case SUBMIT_EVENTS.COMMIT_STARTED:
                await db
                  .update(buildJobs)
                  .set({ submitStatus: 'committing' })
                  .where(eq(buildJobs.id, buildJobId));
                break;

              case SUBMIT_EVENTS.PR_STARTED:
                await db
                  .update(buildJobs)
                  .set({ submitStatus: 'creating_pr' })
                  .where(eq(buildJobs.id, buildJobId));
                break;

              case SUBMIT_EVENTS.PR_COMPLETED:
                prUrl = event.data.pullRequestUrl;
                break;

              case SUBMIT_EVENTS.ERROR:
                throw new Error(event.data.message);

              case SUBMIT_EVENTS.DONE:
                if (event.data.success) {
                  prUrl = event.data.pullRequestUrl || prUrl;
                } else {
                  throw new Error(event.data.error || 'Submit failed');
                }
                break;
            }
          } catch (error) {
            if (error instanceof SyntaxError) {
              console.warn('[SUBMIT] ⚠️  Failed to parse SSE event');
              console.warn('[SUBMIT]    Data:', eventData?.substring(0, 200));
            } else {
              throw error;
            }
          }
        }
      }
    }

    // Update build job submit status
    await db.update(buildJobs).set({ submitStatus: 'done' }).where(eq(buildJobs.id, buildJobId));

    // Update chat session with PR number (extract from URL pathname)
    if (prUrl) {
      try {
        const url = new URL(prUrl);
        const pathSegments = url.pathname.split('/');
        const pullIndex = pathSegments.indexOf('pull');
        if (pullIndex !== -1 && pathSegments[pullIndex + 1]) {
          const pullRequestNumber = parseInt(pathSegments[pullIndex + 1], 10);
          if (!isNaN(pullRequestNumber)) {
            await db
              .update(chatSessions)
              .set({ pullRequestNumber })
              .where(eq(chatSessions.id, chatSessionId));
          }
        }
      } catch {
        console.warn(`[SUBMIT] ⚠️  Failed to parse PR URL: ${prUrl}`);
      }
    }

    console.log(`[SUBMIT] ✅ Submit job ${buildJobId} completed successfully`);

    return {
      success: true,
      prUrl,
    };
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error(`[SUBMIT] ❌ Submit job ${buildJobId} failed`);
    console.error(`[SUBMIT] Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('='.repeat(80) + '\n');

    // Update build job to failed
    await db.update(buildJobs).set({ submitStatus: 'failed' }).where(eq(buildJobs.id, buildJobId));

    throw error;
  }
}

/**
 * Create and initialize submit worker
 * Factory function - NO side effects until called
 */
export function createSubmitWorker() {
  const concurrency = parseInt(process.env.SUBMIT_WORKER_CONCURRENCY!, 10);
  const worker = createWorker<SubmitJobData>(QUEUE_NAMES.SUBMIT, processSubmitJob, {
    concurrency,
  });

  const events = createQueueEvents(QUEUE_NAMES.SUBMIT);

  events.on('completed', ({ jobId, returnvalue }) => {
    console.log('\n' + '='.repeat(80));
    console.log(`[WORKER] ✅ Submit job ${jobId} completed`);
    if (returnvalue) {
      const result = returnvalue as unknown as SubmitJobResult;
      console.log(`[WORKER]    Success: ${result.success}`);
      if (result.prUrl) {
        console.log(`[WORKER]    PR: ${result.prUrl}`);
      }
    }
    console.log('='.repeat(80) + '\n');
  });

  events.on('failed', ({ jobId, failedReason }) => {
    console.error('\n' + '='.repeat(80));
    console.error(`[WORKER] ❌ Submit job ${jobId} failed`);
    console.error(`[WORKER]    Reason: ${failedReason}`);
    console.error('='.repeat(80) + '\n');
  });

  console.log('='.repeat(80));
  console.log('[WORKER] 🚀 Submit Worker Initialized');
  console.log('[WORKER]    Queue: ' + QUEUE_NAMES.SUBMIT);
  console.log('[WORKER]    Concurrency: ' + concurrency);
  console.log('[WORKER]    Ready to process submit jobs');
  console.log('='.repeat(80) + '\n');

  return worker;
}
