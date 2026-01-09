import type { Queue } from 'bullmq';
import { createQueue } from '../client';
import { QUEUE_NAMES } from '../config';

/**
 * Type-safe submit job data
 */
export interface SubmitJobData {
  buildJobId: string;
  chatSessionId: string;
  projectId: string;
  sessionId: string; // For sandbox URL
  cwd?: string; // Working directory in sandbox (default: /app/project)
  ticketsPath: string; // Path to tickets.json for review context (required)
  githubToken: string;
  baseBranch?: string; // Base branch for PR (default: 'main')
  title?: string; // PR title (auto-generated if not provided)
  userEmail?: string; // User email for "Created by" attribution in PR body
  orgId?: string; // Optional - uses system default API key if not provided
}

/**
 * Submit job result
 */
export interface SubmitJobResult {
  success: boolean;
  prUrl?: string;
  error?: string;
}

/**
 * Lazy-initialized submit queue instance
 * Only connects to Redis when first accessed, not on module import
 */
let _submitQueue: Queue<SubmitJobData> | null = null;

export function getSubmitQueue(): Queue<SubmitJobData> {
  if (_submitQueue) {
    return _submitQueue;
  }
  _submitQueue = createQueue<SubmitJobData>(QUEUE_NAMES.SUBMIT);
  return _submitQueue;
}
