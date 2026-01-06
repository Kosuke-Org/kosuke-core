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
  body?: string; // PR body/description (auto-generated if not provided)
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
 * Submit queue instance
 */
export const submitQueue = createQueue<SubmitJobData>(QUEUE_NAMES.SUBMIT);
