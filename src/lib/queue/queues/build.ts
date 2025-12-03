import type { TicketData } from '@/lib/db/schema';
import { createQueue } from '../client';
import { QUEUE_NAMES } from '../config';

/**
 * Build job data - passed to worker
 */
export interface BuildJobData {
  buildJobId: string; // DB record ID
  chatSessionId: string;
  projectId: string;
  sessionPath: string; // File system path to session
  ticketsPath: string; // Path to tickets.json
  tickets: TicketData[];
  dbUrl: string;
  githubToken: string; // For commits
  enableReview: boolean;
  enableTest: boolean;
  testUrl?: string;
}

/**
 * Build job result - returned by worker
 */
export interface BuildJobResult {
  success: boolean;
  completedTickets: number;
  failedTickets: number;
  totalCost: number;
  error?: string;
}

/**
 * Build queue instance
 */
export const buildQueue = createQueue<BuildJobData>(QUEUE_NAMES.BUILD);

/**
 * Enqueue a build job
 */
export async function enqueueBuild(data: BuildJobData): Promise<string> {
  const job = await buildQueue.add('process-build', data, {
    // Build jobs are unique per session - remove any existing pending jobs
    jobId: `build-${data.chatSessionId}`,
    // Don't retry failed builds automatically - let user retry manually
    attempts: 1,
  });

  console.log(`[BUILD] 📋 Enqueued build job ${job.id} for session ${data.chatSessionId}`);
  return job.id!;
}

/**
 * Check if session has an active build
 */
export async function hasActiveBuild(chatSessionId: string): Promise<boolean> {
  const jobId = `build-${chatSessionId}`;
  const job = await buildQueue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  return state === 'waiting' || state === 'active' || state === 'delayed';
}
