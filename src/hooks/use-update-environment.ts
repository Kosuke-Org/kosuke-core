import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface UpdateEnvironmentResponse {
  success: boolean;
}

/**
 * Hook to update environment values in kosuke.config.json
 */
export function useUpdateEnvironment(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (values: Record<string, string>): Promise<UpdateEnvironmentResponse> => {
      const response = await fetch(`/api/projects/${projectId}/environment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update environment');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate environment values query to refetch
      queryClient.invalidateQueries({ queryKey: ['environment-values', projectId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update environment values',
        variant: 'destructive',
      });
    },
  });
}
