import { useMutation, useQueryClient } from '@tanstack/react-query';

interface RetriggerResponse {
  success: boolean;
  data?: {
    environmentJobId: string;
    message: string;
  };
  error?: string;
}

async function retriggerEnvironment(projectId: string): Promise<RetriggerResponse> {
  const response = await fetch(`/api/projects/${projectId}/environment/retrigger`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to re-trigger environment analysis');
  }

  return response.json();
}

/**
 * Hook to re-trigger environment analysis for a project
 * Creates a new environment job and invalidates the job status query
 */
export function useRetriggerEnvironment(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => retriggerEnvironment(projectId),
    onSuccess: () => {
      // Invalidate environment job status to trigger polling
      queryClient.invalidateQueries({ queryKey: ['environment-job', projectId] });
      // Invalidate environment values since they may change
      queryClient.invalidateQueries({ queryKey: ['environment-values', projectId] });
    },
  });
}
