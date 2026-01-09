import type { Queue } from 'bullmq';
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
  error?: string;
}

/**
 * Lazy-initialized build queue instance
 * Only connects to Redis when first accessed, not on module import
 */
let _buildQueue: Queue<BuildJobData> | null = null;

export function getBuildQueue(): Queue<BuildJobData> {
  if (_buildQueue) {
    return _buildQueue;
  }
  _buildQueue = createQueue<BuildJobData>(QUEUE_NAMES.BUILD);
  return _buildQueue;
}
