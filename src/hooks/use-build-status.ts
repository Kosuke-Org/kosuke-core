import type { BuildJobResponse } from '@/lib/types/chat';
import { useQuery } from '@tanstack/react-query';

interface UseBuildStatusOptions {
  projectId: string;
  sessionId: string;
  buildJobId: string;
}

// Terminal states that don't need polling or refetching
const TERMINAL_STATES = ['completed', 'failed', 'cancelled'] as const;

function isTerminalState(status: string | undefined): boolean {
  return TERMINAL_STATES.includes(status as (typeof TERMINAL_STATES)[number]);
}

/**
 * Hook for fetching and polling build job status
 * - Polls every 5 seconds while build is active
 * - Stops polling and caches indefinitely once build reaches terminal state
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
    // Poll every 5 seconds only while build is active
    refetchInterval: query => {
      const status = query.state.data?.buildJob?.status;
      // Stop polling once build reaches terminal state
      if (isTerminalState(status)) {
        return false;
      }
      // Poll while pending/running/validating or no data yet
      return 5000;
    },
    // Completed builds never go stale - no need to refetch
    staleTime: query => {
      const status = query.state.data?.buildJob?.status;
      return isTerminalState(status) ? Infinity : 1000;
    },
    // Don't refetch on window focus for completed builds
    refetchOnWindowFocus: query => {
      const status = query.state.data?.buildJob?.status;
      return !isTerminalState(status);
    },
  });
}
