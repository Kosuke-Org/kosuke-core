import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

interface ConfirmEnvironmentResponse {
  success: boolean;
  data?: {
    projectId: string;
    status: string;
    message: string;
    variableCount: number;
  };
  error?: string;
  emptyVariables?: string[];
}

/**
 * Hook to confirm environment variables and transition project status
 * from 'environments' to 'environments_ready'
 */
export function useConfirmEnvironment(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();

  return useMutation({
    mutationFn: async (): Promise<ConfirmEnvironmentResponse> => {
      const response = await fetch(`/api/projects/${projectId}/environment/confirm`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to confirm environment');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate project query to refetch updated status
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });

      toast({
        title: 'Environment Confirmed',
        description: 'Your environment variables have been saved.',
      });

      // Refresh the page to update UI
      router.refresh();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to confirm environment',
        variant: 'destructive',
      });
    },
  });
}
