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
 * Vamos queue instance
 */
export const vamosQueue = createQueue<VamosJobData>(QUEUE_NAMES.VAMOS);
