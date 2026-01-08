import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Hook to start a sandbox for a project
 * Used by admin to auto-start sandbox when project is in_development or active
 */
export function useStartSandbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(`/api/admin/projects/${projectId}/sandbox/start`, {
        method: 'POST',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start sandbox');
      }
      return response.json();
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['agent-health', projectId] });
    },
  });
}
