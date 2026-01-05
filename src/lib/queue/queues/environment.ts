import { createQueue } from '../client';
import { QUEUE_NAMES } from '../config';

/**
 * Type-safe environment job data
 */
export interface EnvironmentJobData {
  environmentJobId: string;
  projectId: string;
  sessionId: string; // Sandbox session ID for communication
  cwd?: string; // Working directory in sandbox (default: /app/project)
}

/**
 * Environment job result
 */
export interface EnvironmentJobResult {
  success: boolean;
  variableCount: number;
  error?: string;
}

/**
 * Environment queue instance
 */
export const environmentQueue = createQueue<EnvironmentJobData>(QUEUE_NAMES.ENVIRONMENT);
