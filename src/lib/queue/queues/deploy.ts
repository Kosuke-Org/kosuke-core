import type { Queue } from 'bullmq';
import { createQueue } from '../client';
import { QUEUE_NAMES } from '../config';

/**
 * Type-safe deploy job data
 * Contains all info needed to run deploy in a command container
 * Note: AI credentials, Render credentials, Langfuse, Git identity are handled by SandboxManager
 */
export interface DeployJobData {
  deployJobId: string;
  projectId: string;

  // Sandbox options (passed to createSandbox)
  repoUrl: string;
  branch: string;
  githubToken: string;
  orgId?: string;
}

/**
 * Deploy job result
 */
export interface DeployJobResult {
  success: boolean;
  exitCode: number;
  error?: string;
}

/**
 * Lazy-initialized deploy queue instance
 * Only connects to Redis when first accessed, not on module import
 */
let _deployQueue: Queue<DeployJobData> | null = null;

export function getDeployQueue(): Queue<DeployJobData> {
  if (_deployQueue) {
    return _deployQueue;
  }
  _deployQueue = createQueue<DeployJobData>(QUEUE_NAMES.DEPLOY);
  return _deployQueue;
}
