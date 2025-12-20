import type { NewAgentLog } from '@/lib/db/schema';

import { createQueue } from '../client';
import { JOB_NAMES, QUEUE_NAMES } from '../config';

/**
 * CLI Logs queue
 * Handles async processing of CLI command logs from kosuke-cli
 */

export const agentLogsQueue = createQueue<NewAgentLog>(QUEUE_NAMES.AGENT_LOGS);

/**
 * Add CLI log job to the queue
 */
export async function addAgentLogJob(data: NewAgentLog) {
  return await agentLogsQueue.add(JOB_NAMES.PROCESS_AGENT_LOG, data, {
    priority: 1,
    removeOnComplete: true,
  });
}
