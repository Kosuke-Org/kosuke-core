import { createQueue } from '../client';
import { QUEUE_NAMES } from '../config';

/**
 * Type-safe deploy job data
 */
export interface DeployJobData {
  deployJobId: string;
  projectId: string;
  sessionId: string; // For sandbox URL
  cwd?: string; // Working directory in sandbox (default: /app/project)
}

/**
 * Deploy job result
 */
export interface DeployJobResult {
  success: boolean;
  serviceUrls: string[];
  totalCost: number;
  error?: string;
}

/**
 * Deploy queue instance
 */
export const deployQueue = createQueue<DeployJobData>(QUEUE_NAMES.DEPLOY);
