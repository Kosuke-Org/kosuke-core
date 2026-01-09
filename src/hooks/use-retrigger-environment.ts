import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { EnvironmentChange } from '@/lib/sandbox/types';

interface RetriggerResponse {
  success: boolean;
  data?: {
    changes: EnvironmentChange[];
    summary: string;
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
 * Runs synchronously and invalidates environment values on success
 */
export function useRetriggerEnvironment(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => retriggerEnvironment(projectId),
    onSuccess: () => {
      // Invalidate environment values since they may have changed
      queryClient.invalidateQueries({ queryKey: ['environment-values', projectId] });
    },
  });
}
