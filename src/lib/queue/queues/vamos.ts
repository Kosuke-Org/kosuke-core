import type { Queue } from 'bullmq';
import { createQueue } from '../client';
import { QUEUE_NAMES } from '../config';

/**
 * Type-safe vamos job data
 * Contains all info needed to run vamos in a command container
 * Note: AI credentials, Langfuse, Git identity are handled by SandboxManager
 */
export interface VamosJobData {
  vamosJobId: string;
  projectId: string;

  // Vamos-specific options
  withTests: boolean;
  isolated: boolean;

  // Sandbox options (passed to createSandbox)
  repoUrl: string;
  branch: string;
  githubToken: string;
  orgId?: string;
}

/**
 * Vamos job result
 */
export interface VamosJobResult {
  success: boolean;
  exitCode: number;
  error?: string;
}

/**
 * Lazy-initialized vamos queue instance
 * Only connects to Redis when first accessed, not on module import
 */
let _vamosQueue: Queue<VamosJobData> | null = null;

export function getVamosQueue(): Queue<VamosJobData> {
  if (_vamosQueue) {
    return _vamosQueue;
  }
  _vamosQueue = createQueue<VamosJobData>(QUEUE_NAMES.VAMOS);
  return _vamosQueue;
}
