import { useQuery } from '@tanstack/react-query';

interface LatestBuildResponse {
  hasBuild: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | null;
  buildJobId: string | null;
}

/**
 * Hook to fetch the latest build status for a chat session
 */
export function useLatestBuild(projectId: string, sessionId: string | null) {
  return useQuery({
    queryKey: ['latest-build', projectId, sessionId],
    queryFn: async (): Promise<LatestBuildResponse> => {
      if (!sessionId) {
        return { hasBuild: false, status: null, buildJobId: null };
      }

      const response = await fetch(
        `/api/projects/${projectId}/chat-sessions/${sessionId}/latest-build`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch latest build status');
      }

      return response.json();
    },
    enabled: Boolean(projectId && sessionId),
    staleTime: 1000 * 5, // 5 seconds
    refetchInterval: query => {
      const status = query.state.data?.status;
      // Poll more frequently during active builds
      if (status === 'pending' || status === 'running') {
        return 1000 * 3; // 3 seconds during active build
      }
      return 1000 * 10; // 10 seconds otherwise
    },
  });
}
