import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface VamosJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  phase: string | null;
  totalPhases: number | null;
  completedPhases: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface VamosStatusResponse {
  hasJob: boolean;
  job: VamosJob | null;
}

interface VamosLogsResponse {
  job: VamosJob;
  logs: unknown[];
}

interface TriggerVamosParams {
  projectId: string;
  withTests?: boolean;
  isolated?: boolean;
}

/**
 * Hook to get the latest vamos job status for a project
 * Polls while job is running
 */
export function useVamosJob(projectId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['admin-vamos-status', projectId],
    queryFn: async (): Promise<VamosStatusResponse> => {
      const response = await fetch(`/api/admin/projects/${projectId}/vamos/status`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch vamos status');
      }
      return response.json();
    },
    enabled,
    refetchInterval: query => {
      // Poll every 5 seconds while job is running
      const data = query.state.data;
      if (data?.job?.status === 'running' || data?.job?.status === 'pending') {
        return 5000;
      }
      return false;
    },
    staleTime: 2000,
  });
}

/**
 * Hook to trigger vamos workflow for a project
 */
export function useTriggerVamos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, withTests, isolated }: TriggerVamosParams) => {
      const response = await fetch(`/api/admin/projects/${projectId}/vamos/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ withTests, isolated }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to trigger vamos');
      }

      return response.json();
    },
    onSuccess: (data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-vamos-status', projectId] });

      toast({
        title: 'Vamos Started',
        description: `Job ${data.data.jobId} has been queued`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to fetch logs for a specific vamos job
 */
export function useVamosLogs(projectId: string, jobId: string | null) {
  return useQuery({
    queryKey: ['admin-vamos-logs', projectId, jobId],
    queryFn: async (): Promise<VamosLogsResponse> => {
      const response = await fetch(`/api/admin/projects/${projectId}/vamos/logs/${jobId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch vamos logs');
      }
      return response.json();
    },
    enabled: !!jobId,
    refetchInterval: query => {
      // Poll every 5 seconds while job is running
      const data = query.state.data;
      if (data?.job?.status === 'running' || data?.job?.status === 'pending') {
        return 5000;
      }
      return false;
    },
    staleTime: 2000,
  });
}
