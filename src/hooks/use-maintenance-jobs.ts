import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/hooks/use-toast';
import type { MaintenanceJobType } from '@/lib/db/schema';
import type {
  MaintenanceJobsResponse,
  MaintenanceJobWithRun,
  UpdateMaintenanceJobResponse,
} from '@/lib/types';
import { snakeToText } from '@/lib/utils';

/**
 * Query key factory for maintenance jobs
 */
const maintenanceJobsKeys = {
  all: ['maintenance-jobs'] as const,
  project: (projectId: string) => [...maintenanceJobsKeys.all, projectId] as const,
};

/**
 * Hook for fetching maintenance jobs for a project
 */
export function useMaintenanceJobs(projectId: string) {
  return useQuery({
    queryKey: maintenanceJobsKeys.project(projectId),
    queryFn: async (): Promise<MaintenanceJobWithRun[]> => {
      const response = await fetch(`/api/projects/${projectId}/maintenance-jobs`);
      if (!response.ok) throw new Error('Failed to fetch maintenance jobs');
      const data: MaintenanceJobsResponse = await response.json();
      return data.jobs;
    },
    staleTime: 1000 * 30, // 30 seconds
    enabled: !!projectId,
  });
}

/**
 * Hook for updating maintenance job settings with optimistic updates
 */
export function useUpdateMaintenanceJob(projectId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      jobType,
      enabled,
    }: {
      jobType: MaintenanceJobType;
      enabled: boolean;
    }): Promise<UpdateMaintenanceJobResponse> => {
      const response = await fetch(`/api/projects/${projectId}/maintenance-jobs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType, enabled }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update maintenance job');
      }
      return response.json();
    },
    onMutate: async ({ jobType, enabled }) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: maintenanceJobsKeys.project(projectId) });

      // Snapshot the previous value
      const previousJobs = queryClient.getQueryData<MaintenanceJobWithRun[]>(
        maintenanceJobsKeys.project(projectId)
      );

      // Optimistically update the cache
      queryClient.setQueryData<MaintenanceJobWithRun[]>(
        maintenanceJobsKeys.project(projectId),
        old => old?.map(job => (job.jobType === jobType ? { ...job, enabled } : job)) ?? []
      );

      // Return context with snapshot for rollback
      return { previousJobs };
    },
    onSuccess: (_data, { jobType, enabled }) => {
      toast({
        title: 'Settings updated',
        description: `${snakeToText(jobType)} ${enabled ? 'enabled' : 'disabled'}`,
      });
    },
    onError: (error, _variables, context) => {
      // Rollback to previous value on error
      if (context?.previousJobs) {
        queryClient.setQueryData(maintenanceJobsKeys.project(projectId), context.previousJobs);
      }

      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update maintenance job',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      // Refetch to ensure server state is synced
      queryClient.invalidateQueries({ queryKey: maintenanceJobsKeys.project(projectId) });
    },
  });
}
