import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface RestartBuildOptions {
  projectId: string;
  sessionId: string;
  buildJobId: string;
}

interface RestartBuildData {
  originalBuildJobId: string;
  newBuildJobId: string;
  resetCommit?: string;
  tasksCount: number;
  message: string;
}

type RestartBuildResponse =
  | { success: true; data: RestartBuildData }
  | { success: false; error: string };

/**
 * Hook for restarting a failed build job
 */
export function useRestartBuild({ projectId, sessionId, buildJobId }: RestartBuildOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<RestartBuildResponse> => {
      const response = await fetch(
        `/api/projects/${projectId}/chat-sessions/${sessionId}/restart-build/${buildJobId}`,
        { method: 'POST' }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to restart build');
      }
      return response.json();
    },
    onSuccess: data => {
      if (!data.success) return; // Type guard for discriminated union

      toast({
        title: 'Build restarted',
        description: data.data.message,
      });
      // Invalidate build queries to refresh status
      queryClient.invalidateQueries({ queryKey: ['build-job', buildJobId] });
      queryClient.invalidateQueries({ queryKey: ['build-job', data.data.newBuildJobId] });
      // Invalidate the latest build query for this session
      queryClient.invalidateQueries({ queryKey: ['latest-build', projectId, sessionId] });
      // Invalidate chat messages to show the new build message
      queryClient.invalidateQueries({ queryKey: ['chat-session-messages', projectId, sessionId] });
    },
    onError: error => {
      toast({
        title: 'Failed to restart build',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });
}
