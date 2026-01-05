import { useQuery } from '@tanstack/react-query';

import type { EnvironmentJobStatus } from '@/lib/db/schema';

interface EnvironmentJob {
  id: string;
  status: EnvironmentJobStatus;
  variableCount: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface EnvironmentJobResponse {
  job: EnvironmentJob | null;
  message?: string;
}

async function fetchEnvironmentJobStatus(projectId: string): Promise<EnvironmentJobResponse> {
  const response = await fetch(`/api/projects/${projectId}/environment/status`);

  if (!response.ok) {
    throw new Error('Failed to fetch environment job status');
  }

  return response.json();
}

/**
 * Hook to poll the environment analysis job status
 *
 * - Polls every 2 seconds while job is pending/running
 * - Stops polling when job is completed/failed
 * - Returns the latest job status
 */
export function useEnvironmentJob(projectId: string | undefined) {
  const query = useQuery({
    queryKey: ['environment-job', projectId],
    queryFn: () => fetchEnvironmentJobStatus(projectId!),
    enabled: !!projectId,
    // Poll every 2 seconds while job is in progress
    refetchInterval: query => {
      const job = query.state.data?.job;
      // Stop polling if no job or job is done
      if (!job) return false;
      if (job.status === 'completed' || job.status === 'failed') return false;
      // Continue polling for pending/running jobs
      return 2000;
    },
    staleTime: 0, // Always fetch fresh data when polling
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
  });

  const job = query.data?.job ?? null;

  return {
    job,
    isLoading: query.isLoading,
    isPolling: job?.status === 'pending' || job?.status === 'running',
    isCompleted: job?.status === 'completed',
    isFailed: job?.status === 'failed',
    error: query.error,
    refetch: query.refetch,
  };
}
