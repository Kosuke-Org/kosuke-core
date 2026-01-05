import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface DeployJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: string | null;
  deployedServices: string[];
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface DeployStatusResponse {
  hasJob: boolean;
  job: DeployJob | null;
}

interface DeployLogsResponse {
  job: DeployJob;
  logs: unknown[];
}

interface DeployConfig {
  hasConfig: boolean;
  config: Record<string, unknown> | null;
  hasProductionConfig: boolean;
  error?: string;
}

interface ProductionConfig {
  services?: Record<
    string,
    {
      plan?: string;
      envVars?: Record<string, string>;
    }
  >;
  storages?: Record<
    string,
    {
      plan?: string;
    }
  >;
}

interface UpdateDeployConfigParams {
  projectId: string;
  production: ProductionConfig;
}

/**
 * Hook to get deploy configuration for a project
 */
export function useDeployConfig(projectId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['admin-deploy-config', projectId],
    queryFn: async (): Promise<DeployConfig> => {
      const response = await fetch(`/api/admin/projects/${projectId}/deploy/config`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch deploy config');
      }
      return response.json();
    },
    enabled,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to update deploy configuration for a project
 */
export function useUpdateDeployConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, production }: UpdateDeployConfigParams) => {
      const response = await fetch(`/api/admin/projects/${projectId}/deploy/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ production }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update deploy config');
      }

      return response.json();
    },
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-deploy-config', projectId] });

      toast({
        title: 'Configuration Updated',
        description: 'Deploy configuration has been saved',
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
 * Hook to get the latest deploy job status for a project
 * Polls while job is running
 */
export function useDeployJob(projectId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['admin-deploy-status', projectId],
    queryFn: async (): Promise<DeployStatusResponse> => {
      const response = await fetch(`/api/admin/projects/${projectId}/deploy/status`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch deploy status');
      }
      return response.json();
    },
    enabled,
    refetchInterval: query => {
      // Poll every 2 seconds while job is running
      const data = query.state.data;
      if (data?.job?.status === 'running' || data?.job?.status === 'pending') {
        return 2000;
      }
      return false;
    },
    staleTime: 1000,
  });
}

/**
 * Hook to trigger deploy workflow for a project
 */
export function useTriggerDeploy() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(`/api/admin/projects/${projectId}/deploy/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to trigger deploy');
      }

      return response.json();
    },
    onSuccess: (data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['admin-deploy-status', projectId] });

      toast({
        title: 'Deploy Started',
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
 * Hook to fetch logs for a specific deploy job
 */
export function useDeployLogs(projectId: string, jobId: string | null) {
  return useQuery({
    queryKey: ['admin-deploy-logs', projectId, jobId],
    queryFn: async (): Promise<DeployLogsResponse> => {
      const response = await fetch(`/api/admin/projects/${projectId}/deploy/logs/${jobId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch deploy logs');
      }
      return response.json();
    },
    enabled: !!jobId,
    refetchInterval: query => {
      // Poll every 2 seconds while job is running
      const data = query.state.data;
      if (data?.job?.status === 'running' || data?.job?.status === 'pending') {
        return 2000;
      }
      return false;
    },
    staleTime: 1000,
  });
}
