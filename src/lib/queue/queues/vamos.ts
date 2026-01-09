import { createQueue } from '../client';
import { QUEUE_NAMES } from '../config';

/**
 * Type-safe vamos job data
 * Contains all info needed to run vamos in a command container
 */
export interface VamosJobData {
  vamosJobId: string;
  projectId: string;

  // Vamos options
  withTests: boolean;
  isolated: boolean;

  // Environment variables for the container
  env: {
    repoUrl: string;
    branch: string;
    githubToken: string;
    dbUrl: string;
    orgId?: string;
    anthropicApiKey: string;
  };
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
