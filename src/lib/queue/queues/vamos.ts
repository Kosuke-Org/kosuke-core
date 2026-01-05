import { createQueue } from '../client';
import { QUEUE_NAMES } from '../config';

/**
 * Type-safe vamos job data
 */
export interface VamosJobData {
  vamosJobId: string;
  projectId: string;
  sessionId: string; // For sandbox URL
  cwd?: string; // Working directory in sandbox (default: /app/project)
  dbUrl: string;
  url?: string; // Test URL
  withTests: boolean;
  isolated: boolean;
}

/**
 * Vamos job result
 */
export interface VamosJobResult {
  success: boolean;
  stepsCompleted: number;
  ticketsProcessed?: number;
  testsProcessed?: number;
  totalCost: number;
  error?: string;
}

/**
 * Vamos queue instance
 */
export const vamosQueue = createQueue<VamosJobData>(QUEUE_NAMES.VAMOS);
