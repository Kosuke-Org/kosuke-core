import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

interface ConfirmRequirementsResponse {
  success: boolean;
  message?: string;
}

/**
 * Hook to confirm requirements and transition project status
 * from 'requirements' to 'requirements_ready'
 */
export function useConfirmRequirements(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();

  return useMutation({
    mutationFn: async (): Promise<ConfirmRequirementsResponse> => {
      const response = await fetch(`/api/projects/${projectId}/requirements/confirm`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to confirm requirements');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate project query to refetch updated status
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });

      toast({
        title: 'Requirements Confirmed',
        description: 'Your project requirements have been sent for review.',
      });

      // Refresh the page to update UI
      router.refresh();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to confirm requirements',
        variant: 'destructive',
      });
    },
  });
}
