import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from './use-toast';

interface SubmitBuildResponse {
  success: boolean;
  data?: {
    buildJobId: string;
    submitStatus: string;
    message: string;
  };
  error?: string;
}

/**
 * Hook to submit a build for review, commit, and PR creation
 */
export function useSubmitBuild(projectId: string, sessionId: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (buildJobId: string): Promise<SubmitBuildResponse> => {
      if (!sessionId) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `/api/projects/${projectId}/chat-sessions/${sessionId}/submit-build/${buildJobId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Submit failed' }));
        throw new Error(error.error || 'Failed to submit build');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate latest build query to trigger refetch with new submitStatus
      queryClient.invalidateQueries({
        queryKey: ['latest-build', projectId, sessionId],
      });
    },
    onError: error => {
      toast({
        title: 'Submit failed',
        description: error instanceof Error ? error.message : 'Failed to submit build',
        variant: 'destructive',
      });
    },
  });
}
