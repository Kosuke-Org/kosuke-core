#!/usr/bin/env bun
/**
 * Run Worker Jobs Programmatically
 *
 * This file runs as a standalone script to trigger background jobs directly,
 * bypassing the queue (useful for testing, debugging, or manual triggers).
 *
 * Usage:
 *   bun src/run-job.ts <job-name> [options]
 *   bun src/run-job.ts --list
 *
 * Examples:
 *   bun src/run-job.ts preview-cleanup
 *   bun src/run-job.ts preview-cleanup --threshold 30
 */

import { QUEUE_NAMES } from '@/lib/queue/config';
import { cleanupInactiveSessions } from '@/lib/sandbox/cleanup';

// ============================================================
// Job Registry - Maps queue names to their direct implementations
// ============================================================

type JobRunner = (args: string[]) => Promise<void>;

interface JobConfig {
  description: string;
  options?: string;
  runner: JobRunner;
}

/**
 * Maps QUEUE_NAMES to runnable job configurations.
 * Only jobs that can run standalone (without sandbox/HTTP) are included.
 */
const RUNNABLE_JOBS: Record<string, JobConfig> = {
  [QUEUE_NAMES.PREVIEW_CLEANUP]: {
    description: 'Cleanup inactive sandbox sessions',
    options: '[--threshold <minutes>]',
    runner: async (args: string[]) => {
      const thresholdIndex = args.indexOf('--threshold');
      let thresholdMinutes: number;

      if (thresholdIndex !== -1 && args[thresholdIndex + 1]) {
        thresholdMinutes = parseInt(args[thresholdIndex + 1], 10);
        if (isNaN(thresholdMinutes)) {
          throw new Error('Invalid threshold value. Must be a number.');
        }
      } else {
        thresholdMinutes = parseInt(process.env.CLEANUP_THRESHOLD_MINUTES || '60', 10);
      }

      console.log(`🧹 Running cleanup (threshold: ${thresholdMinutes} minutes)...\n`);
      const cleanedCount = await cleanupInactiveSessions(thresholdMinutes);
      console.log(`\n✅ Sessions stopped: ${cleanedCount}`);
    },
  },

  // build and submit jobs require sandbox HTTP calls - not runnable standalone
  // [QUEUE_NAMES.BUILD]: { ... } - requires sandbox
  // [QUEUE_NAMES.SUBMIT]: { ... } - requires sandbox
};

// Jobs that exist but can't run standalone
const NON_RUNNABLE_JOBS = [QUEUE_NAMES.BUILD, QUEUE_NAMES.SUBMIT];

// ============================================================
// CLI
// ============================================================

function printUsage() {
  console.log(`
Usage: bun src/run-job.ts <job-name> [options]
       bun src/run-job.ts --list

Runnable jobs:`);

  for (const [name, config] of Object.entries(RUNNABLE_JOBS)) {
    const opts = config.options ? ` ${config.options}` : '';
    console.log(`  ${name}${opts}`);
    console.log(`      ${config.description}`);
  }

  if (NON_RUNNABLE_JOBS.length > 0) {
    console.log(`
Queue-only jobs (require worker process):`);
    for (const name of NON_RUNNABLE_JOBS) {
      console.log(`  ${name} (use worker process)`);
    }
  }

  console.log(`
Options:
  --list, -l    List all available jobs
  --help, -h    Show this help message

Examples:
  bun src/run-job.ts preview-cleanup
  bun src/run-job.ts preview-cleanup --threshold 30
`);
}

function listJobs() {
  console.log('\n✓ Runnable jobs (can execute directly):\n');
  for (const [name, config] of Object.entries(RUNNABLE_JOBS)) {
    const opts = config.options ? ` ${config.options}` : '';
    console.log(`  ${name}${opts}`);
    console.log(`    ${config.description}\n`);
  }

  if (NON_RUNNABLE_JOBS.length > 0) {
    console.log('✗ Queue-only jobs (require worker process):\n');
    for (const name of NON_RUNNABLE_JOBS) {
      console.log(`  ${name}`);
    }
    console.log('');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command === '--list' || command === '-l') {
    listJobs();
    process.exit(0);
  }

  // Check if it's a valid queue name
  const allQueueNames = Object.values(QUEUE_NAMES);
  if (!allQueueNames.includes(command as (typeof allQueueNames)[number])) {
    console.error(`❌ Unknown job: ${command}\n`);
    console.log('Valid queue names:', allQueueNames.join(', '));
    console.log('\nRun with --list for more information.');
    process.exit(1);
  }

  // Check if it's runnable
  const job = RUNNABLE_JOBS[command];
  if (!job) {
    console.error(`❌ Job "${command}" requires the worker process.\n`);
    console.log('This job processes HTTP requests to sandboxes and cannot run standalone.');
    console.log('Use: bun run workers:dev');
    process.exit(1);
  }

  // Run the job
  console.log(`[RUN-JOB] 🚀 Starting job: ${command}\n`);

  try {
    await job.runner(args.slice(1));
    console.log(`\n[RUN-JOB] ✅ Job "${command}" completed successfully`);
    process.exit(0);
  } catch (error) {
    console.error(`\n[RUN-JOB] ❌ Job "${command}" failed:`, error);
    process.exit(1);
  }
}

main();
