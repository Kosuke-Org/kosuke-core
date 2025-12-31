/**
 * Submit Worker
 * Processes submit jobs from BullMQ queue
 * Calls kosuke-cli submit command via HTTP (review → commit → PR)
 */

import { db } from '@/lib/db/drizzle';
import { buildJobs, chatSessions } from '@/lib/db/schema';
import { SandboxClient } from '@/lib/sandbox/client';
import { eq } from 'drizzle-orm';
import { createQueueEvents, createWorker } from '../client';
import { QUEUE_NAMES } from '../config';
import type { SubmitJobData, SubmitJobResult } from '../queues/submit';

/**
 * Process a submit job by calling kosuke-cli submit endpoint
 */
async function processSubmitJob(job: { data: SubmitJobData }): Promise<SubmitJobResult> {
  const { buildJobId, chatSessionId, sessionId, ticketsPath, githubToken, baseBranch, title } =
    job.data;

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

        if (eventData) {
          if (eventData === '[DONE]') break;

          try {
            const parsed = JSON.parse(eventData);
            const event = eventType ? { type: eventType, data: parsed } : parsed;

            switch (event.type) {
              case 'started':
                console.log(`[SUBMIT] 🏗️  Submit started in ${event.data.cwd}`);
                break;

              case 'review_started':
                console.log('\n' + '-'.repeat(60));
                console.log('[SUBMIT] 🔍 Phase: REVIEW (started)');
                console.log('-'.repeat(60) + '\n');
                await db
                  .update(buildJobs)
                  .set({ submitStatus: 'reviewing' })
                  .where(eq(buildJobs.id, buildJobId));
                break;

              case 'review_event':
                if (event.data.subtype === 'tool_call') {
                  const action = event.data.details?.action || 'unknown';
                  const params = event.data.details?.params as Record<string, unknown> | undefined;
                  const paramStr =
                    params?.path || params?.command || params?.pattern || params?.query || '';
                  console.log(`[SUBMIT] 🔧 Review: ${action}${paramStr ? ` ${paramStr}` : ''}`);
                } else if (event.data.subtype === 'message') {
                  const text = (event.data.details?.text as string)?.substring(0, 150);
                  if (text) {
                    console.log(`[SUBMIT] 💭 ${text}${text.length >= 150 ? '...' : ''}`);
                  }
                } else if (event.data.subtype === 'git_diff_generated') {
                  console.log(
                    `[SUBMIT] 📝 Git diff size: ${event.data.details?.diffSize || 0} chars`
                  );
                }
                break;

              case 'review_completed':
                console.log(
                  `[SUBMIT] ✅ Review completed: ${event.data.issuesFound} issues found, ${event.data.fixesApplied} fixes applied`
                );
                break;

              case 'commit_started':
                console.log('\n' + '-'.repeat(60));
                console.log('[SUBMIT] 💾 Phase: COMMIT (started)');
                console.log('-'.repeat(60) + '\n');
                await db
                  .update(buildJobs)
                  .set({ submitStatus: 'committing' })
                  .where(eq(buildJobs.id, buildJobId));
                break;

              case 'commit_event':
                if (event.data.subtype === 'skipped') {
                  console.log(
                    `[SUBMIT] ℹ️  Commit skipped: ${event.data.details?.reason || 'no changes'} (verified: ${event.data.details?.verified ?? false})`
                  );
                } else if (event.data.subtype === 'progress') {
                  const details = event.data.details as {
                    phase?: string;
                    attempt?: number;
                    maxRetries?: number;
                    commitCreated?: boolean;
                    isClean?: boolean;
                    success?: boolean;
                  };
                  if (details?.phase === 'retry') {
                    console.log(
                      `[SUBMIT] 🔄 Commit retry ${(details.attempt ?? 1) - 1}/${details.maxRetries ?? 3}: retrying...`
                    );
                  } else if (details?.phase === 'validation') {
                    const statusIcon = details.success
                      ? '✅'
                      : details.commitCreated === false
                        ? '⏳'
                        : '❌';
                    console.log(
                      `[SUBMIT] ${statusIcon} Commit validation (attempt ${details.attempt}/${details.maxRetries}): created=${details.commitCreated ?? 'unknown'}, clean=${details.isClean ?? 'unknown'}`
                    );
                  } else {
                    console.log(`[SUBMIT] ℹ️  Commit progress: ${details?.phase || 'unknown'}`);
                  }
                } else if (event.data.subtype === 'tool_call') {
                  const action = event.data.details?.action || 'unknown';
                  const params = event.data.details?.params as Record<string, unknown> | undefined;
                  const paramStr =
                    params?.path || params?.command || params?.pattern || params?.query || '';
                  console.log(`[SUBMIT] 🔧 Commit: ${action}${paramStr ? ` ${paramStr}` : ''}`);
                } else if (event.data.subtype === 'message') {
                  const text = (event.data.details?.text as string)?.substring(0, 150);
                  if (text) {
                    console.log(`[SUBMIT] 💭 ${text}${text.length >= 150 ? '...' : ''}`);
                  }
                }
                break;

              case 'commit_completed':
                console.log(`[SUBMIT] ✅ Commit completed: ${event.data.commitSha || 'unknown'}`);
                break;

              case 'pr_started':
                console.log('\n' + '-'.repeat(60));
                console.log('[SUBMIT] 📋 Phase: CREATE PR (started)');
                console.log('-'.repeat(60) + '\n');
                await db
                  .update(buildJobs)
                  .set({ submitStatus: 'creating_pr' })
                  .where(eq(buildJobs.id, buildJobId));
                break;

              case 'pr_completed':
                prUrl = event.data.prUrl;
                console.log(`[SUBMIT] ✅ PR created: ${prUrl}`);
                break;

              case 'error':
                console.error(`[SUBMIT] ❌ Error: ${event.data.message}`);
                throw new Error(event.data.message);

              case 'done':
                if (event.data.success) {
                  prUrl = event.data.prUrl || prUrl;
                  console.log('\n' + '='.repeat(80));
                  console.log(`[SUBMIT] 🎉 Submit completed successfully`);
                  console.log(`[SUBMIT] 📋 PR: ${prUrl}`);
                  console.log('='.repeat(80) + '\n');
                } else {
                  throw new Error(event.data.error || 'Submit failed');
                }
                break;

              default:
                console.log(
                  `[SUBMIT] ℹ️  ${event.type}: ${JSON.stringify(event.data).substring(0, 200)}`
                );
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

    // Update chat session with PR number (extract from URL: /pull/123)
    if (prUrl) {
      const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
      if (prNumberMatch) {
        const pullRequestNumber = parseInt(prNumberMatch[1], 10);
        await db
          .update(chatSessions)
          .set({ pullRequestNumber })
          .where(eq(chatSessions.id, chatSessionId));
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
  const worker = createWorker<SubmitJobData>(QUEUE_NAMES.SUBMIT, processSubmitJob, {
    concurrency: 1, // One submit at a time per worker
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
  console.log('[WORKER]    Concurrency: 1');
  console.log('[WORKER]    Ready to process submit jobs');
  console.log('='.repeat(80) + '\n');

  return worker;
}
