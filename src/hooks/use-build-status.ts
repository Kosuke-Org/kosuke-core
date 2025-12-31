import type { BuildJobResponse } from '@/lib/types/chat';
import { useQuery } from '@tanstack/react-query';

interface UseBuildStatusOptions {
  projectId: string;
  sessionId: string;
  buildJobId: string;
}

/**
 * Hook for fetching and polling build job status
 */
export function useBuildStatus({ projectId, sessionId, buildJobId }: UseBuildStatusOptions) {
  return useQuery({
    queryKey: ['build-job', buildJobId],
    queryFn: async (): Promise<BuildJobResponse> => {
      const response = await fetch(
        `/api/projects/${projectId}/chat-sessions/${sessionId}/build-status/${buildJobId}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch build status');
      }
      return response.json();
    },
    // Poll every 5 seconds while build is active
    refetchInterval: query => {
      const buildJob = query.state.data?.buildJob;
      // Stop polling only when we have data AND build is done
      if (
        buildJob?.status === 'ready' ||
        buildJob?.status === 'failed' ||
        buildJob?.status === 'cancelled'
      ) {
        return false;
      }
      // Keep polling: no data yet, error recovery, or build in progress
      return 5000;
    },
    staleTime: 1000,
  });
}
