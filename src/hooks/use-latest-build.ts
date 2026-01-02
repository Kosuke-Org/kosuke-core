import { useQuery } from '@tanstack/react-query';

interface LatestBuildResponse {
  hasBuild: boolean;
  status: 'pending' | 'running' | 'validating' | 'completed' | 'failed' | 'cancelled' | null;
  buildJobId: string | null;
  submitStatus: 'pending' | 'reviewing' | 'committing' | 'creating_pr' | 'done' | 'failed' | null;
  prUrl: string | null;
}

/**
 * Hook to fetch the latest build status for a chat session
 */
export function useLatestBuild(projectId: string, sessionId: string | null) {
  return useQuery({
    queryKey: ['latest-build', projectId, sessionId],
    queryFn: async (): Promise<LatestBuildResponse> => {
      if (!sessionId) {
        return { hasBuild: false, status: null, buildJobId: null, submitStatus: null, prUrl: null };
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
      const data = query.state.data;
      // Poll more frequently during active builds or submit
      if (
        data?.status === 'pending' ||
        data?.status === 'running' ||
        data?.status === 'validating'
      ) {
        return 1000 * 3; // 3 seconds during active build
      }
      // Poll during submit process
      if (data?.submitStatus && data.submitStatus !== 'done' && data.submitStatus !== 'failed') {
        return 1000 * 2; // 2 seconds during submit
      }
      return 1000 * 10; // 10 seconds otherwise
    },
  });
}
