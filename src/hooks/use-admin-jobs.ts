import { useQuery } from '@tanstack/react-query';

import type {
  AllJobsResponse,
  JobStatus,
  ListSchedulersResponse,
  SchedulerWithQueue,
} from '@/lib/types';

interface UseAllJobsParams {
  status: JobStatus;
  page: number;
  pageSize: number;
}

/**
 * Hook to fetch all jobs from all queues filtered by status
 */
export function useAllJobs({ status, page, pageSize }: UseAllJobsParams, enabled: boolean = true) {
  return useQuery({
    queryKey: ['admin-all-jobs', status, page, pageSize],
    queryFn: async (): Promise<AllJobsResponse> => {
      const params = new URLSearchParams({
        status,
        page: String(page),
        pageSize: String(pageSize),
      });

      const response = await fetch(`/api/admin/jobs?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch jobs');
      }
      const json = await response.json();
      return json.data as AllJobsResponse;
    },
    enabled,
    staleTime: 10000, // 10 seconds
  });
}

interface UseSchedulersResponse {
  schedulers: SchedulerWithQueue[];
}

/**
 * Hook to fetch all schedulers/cron jobs from all queues
 */
export function useSchedulers(enabled: boolean = true) {
  return useQuery({
    queryKey: ['admin-schedulers'],
    queryFn: async (): Promise<UseSchedulersResponse> => {
      const response = await fetch('/api/admin/cron');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch schedulers');
      }
      const json = await response.json();
      return json.data as ListSchedulersResponse;
    },
    enabled,
    staleTime: 30000, // 30 seconds
  });
}
