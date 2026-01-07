import { createQueue } from '../client';
import { QUEUE_NAMES } from '../config';

/**
 * Type-safe build job data
 */
export interface BuildJobData {
  buildJobId: string;
  chatSessionId: string;
  projectId: string;
  sessionId: string; // For sandbox URL
  userId: string; // User ID for tracking/logging
  ticketsPath: string; // File path for tickets.json
  cwd?: string; // Working directory in sandbox (default: /app)
  dbUrl: string;
  githubToken: string;
  enableTest: boolean;
  testUrl?: string;
  orgId?: string; // Optional - uses system default API key if not provided
}

/**
 * Build job result
 */
export interface BuildJobResult {
  success: boolean;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalCost: number;
  error?: string;
}

/**
 * Build queue instance
 */
export const buildQueue = createQueue<BuildJobData>(QUEUE_NAMES.BUILD);
