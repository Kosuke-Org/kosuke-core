import type { Job } from 'bullmq';
import { NextRequest, NextResponse } from 'next/server';

import { isSuperAdminByUserId } from '@/lib/admin/permissions';
import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { createQueue } from '@/lib/queue/client';
import { QUEUE_NAMES } from '@/lib/queue/config';
import type { AllJobsResponse, JobDetailsWithQueue, JobStatus } from '@/lib/types';

/**
 * GET /api/admin/jobs
 * List all jobs from all queues filtered by status (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const isAdmin = await isSuperAdminByUserId(userId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden();
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || 'failed') as JobStatus;
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') || '20'), 5), 100);

    const queueNames = Object.values(QUEUE_NAMES);

    // Fetch counts and jobs from all queues in parallel
    const queueDataPromises = queueNames.map(async queueName => {
      const queue = createQueue(queueName);

      // Get counts for all statuses
      const [waitingCount, activeCount, completedCount, failedCount, delayedCount] =
        await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);

      // Get jobs for the selected status (fetch more than needed to handle pagination across queues)
      let jobs: Job[] = [];
      switch (status) {
        case 'completed':
          jobs = await queue.getCompleted(0, 99);
          break;
        case 'failed':
          jobs = await queue.getFailed(0, 99);
          break;
        case 'active':
          jobs = await queue.getActive(0, 99);
          break;
        case 'waiting':
          jobs = await queue.getWaiting(0, 99);
          break;
        case 'delayed':
          jobs = await queue.getDelayed(0, 99);
          break;
      }

      return {
        queueName,
        counts: {
          waiting: waitingCount,
          active: activeCount,
          completed: completedCount,
          failed: failedCount,
          delayed: delayedCount,
        },
        jobs: jobs.map(
          (job): JobDetailsWithQueue => ({
            id: job.id ?? 'unknown',
            name: job.name,
            data: job.data as Record<string, unknown>,
            progress: typeof job.progress === 'number' ? job.progress : 0,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            failedReason: job.failedReason,
            stacktrace: job.stacktrace,
            returnvalue: job.returnvalue,
            queueName,
          })
        ),
      };
    });

    const allQueueData = await Promise.all(queueDataPromises);

    // Aggregate counts across all queues
    const aggregatedCounts = allQueueData.reduce(
      (acc, qd) => ({
        waiting: acc.waiting + qd.counts.waiting,
        active: acc.active + qd.counts.active,
        completed: acc.completed + qd.counts.completed,
        failed: acc.failed + qd.counts.failed,
        delayed: acc.delayed + qd.counts.delayed,
      }),
      { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
    );

    // Combine all jobs and sort by timestamp (newest first)
    const allJobs = allQueueData.flatMap(qd => qd.jobs).sort((a, b) => b.timestamp - a.timestamp);

    // Get total for the selected status
    const total = aggregatedCounts[status];

    // Paginate
    const startIndex = (page - 1) * pageSize;
    const paginatedJobs = allJobs.slice(startIndex, startIndex + pageSize);

    const response: AllJobsResponse = {
      jobs: paginatedJobs,
      counts: aggregatedCounts,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    console.error('[API /admin/jobs] Error fetching jobs:', error);
    return ApiErrorHandler.handle(error);
  }
}
