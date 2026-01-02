import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface CancelBuildOptions {
  projectId: string;
  sessionId: string;
  buildJobId: string;
}

interface CancelBuildResponse {
  success: boolean;
  data?: {
    cancelled: number;
    resetCommit?: string;
    message: string;
  };
  error?: string;
}

/**
 * Hook for cancelling a build job
 */
export function useCancelBuild({ projectId, sessionId, buildJobId }: CancelBuildOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<CancelBuildResponse> => {
      const response = await fetch(
        `/api/projects/${projectId}/chat-sessions/${sessionId}/cancel-build/${buildJobId}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to cancel build');
      }
      return response.json();
    },
    onSuccess: data => {
      toast({
        title: 'Build cancelled',
        description: data.data?.message || 'The build has been cancelled',
      });
      // Invalidate build query to refresh status
      queryClient.invalidateQueries({ queryKey: ['build-job', buildJobId] });
    },
    onError: error => {
      toast({
        title: 'Failed to cancel build',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });
}
