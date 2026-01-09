import { createQueue } from '../client';
import { QUEUE_NAMES } from '../config';

/**
 * Type-safe deploy job data
 * Contains all info needed to run deploy in a command container
 */
export interface DeployJobData {
  deployJobId: string;
  projectId: string;

  // Environment variables for the container
  env: {
    repoUrl: string;
    branch: string;
    githubToken: string;
    orgId?: string;
    anthropicApiKey: string;
    renderApiKey: string;
    renderOwnerId: string;
  };
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
 * Deploy queue instance
 */
export const deployQueue = createQueue<DeployJobData>(QUEUE_NAMES.DEPLOY);
