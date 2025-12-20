/**
 * Agent Logs Worker
 * Processes agent log jobs from BullMQ queue
 * Inserts CLI logs into database
 */

import { db } from '@/lib/db/drizzle';
import type { NewAgentLog } from '@/lib/db/schema';
import { agentLogs } from '@/lib/db/schema';
import { createWorker } from '../client';
import { QUEUE_NAMES } from '../config';

interface AgentLogJobResult {
  success: boolean;
  logId: string;
}

/**
 * Process an agent log job by inserting into database
 */
async function processAgentLogJob(job: { data: NewAgentLog }): Promise<AgentLogJobResult> {
  try {
    const [inserted] = await db
      .insert(agentLogs)
      .values({
        ...job.data,
        startedAt: new Date(job.data.startedAt),
        completedAt: new Date(job.data.completedAt),
      })
      .returning({ id: agentLogs.id });

    console.log(`[AGENT-LOGS] ✅ Log processed successfully: ${inserted.id}`);

    return {
      success: true,
      logId: inserted.id,
    };
  } catch (error) {
    console.error(`[AGENT-LOGS] ❌ Error processing log:`, error);
    throw error;
  }
}

/**
 * Create and initialize agent logs worker
 * Factory function - NO side effects until called
 */
export function createAgentLogsWorker() {
  const worker = createWorker<NewAgentLog>(QUEUE_NAMES.AGENT_LOGS, processAgentLogJob, {
    concurrency: 10,
  });

  return worker;
}
