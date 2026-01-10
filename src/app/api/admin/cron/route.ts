import { NextResponse } from 'next/server';

import { isSuperAdminByUserId } from '@/lib/admin/permissions';
import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { createQueue } from '@/lib/queue/client';
import { QUEUE_NAMES } from '@/lib/queue/config';
import type { ListSchedulersResponse, SchedulerWithQueue } from '@/lib/types';

/**
 * GET /api/admin/cron
 * List all schedulers/cron jobs from all queues (admin only)
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const isAdmin = await isSuperAdminByUserId(userId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden();
    }

    const queueNames = Object.values(QUEUE_NAMES);

    // Fetch schedulers from all queues in parallel
    const schedulersPromises = queueNames.map(async queueName => {
      const queue = createQueue(queueName);
      const schedulers = await queue.getJobSchedulers();

      // Get last completed job for each scheduler to determine last run
      const schedulersWithLastRun: SchedulerWithQueue[] = await Promise.all(
        schedulers.map(async s => {
          // Try to get the most recent completed job for this scheduler
          let lastRun: number | null = null;
          try {
            const completedJobs = await queue.getCompleted(0, 0);
            const matchingJob = completedJobs.find(job => job.name === s.name);
            if (matchingJob?.finishedOn) {
              lastRun = matchingJob.finishedOn;
            }
          } catch {
            // Ignore errors fetching last run
          }

          return {
            id: s.id ?? s.name,
            name: s.name,
            pattern: s.pattern,
            every: s.every,
            nextRun: s.next ?? null,
            queueName,
            lastRun,
          };
        })
      );

      return schedulersWithLastRun;
    });

    const allSchedulers = await Promise.all(schedulersPromises);
    const flattenedSchedulers = allSchedulers.flat();

    // Sort by next run time (soonest first)
    flattenedSchedulers.sort((a, b) => {
      if (a.nextRun === null) return 1;
      if (b.nextRun === null) return -1;
      return a.nextRun - b.nextRun;
    });

    const response: ListSchedulersResponse = {
      schedulers: flattenedSchedulers,
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    console.error('[API /admin/cron] Error fetching schedulers:', error);
    return ApiErrorHandler.handle(error);
  }
}
