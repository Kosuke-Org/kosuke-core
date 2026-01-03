import { useQuery } from '@tanstack/react-query';

export interface AgentHealthStatus {
  ok: boolean;
  running: boolean;
  alive: boolean;
  ready: boolean;
  processing: boolean;
  uptime?: number;
  memory?: {
    heapUsed: number;
    heapTotal: number;
  };
  sandboxStatus: 'running' | 'stopped' | 'not_found' | 'error';
  agentStatus?: 'healthy' | 'not_responding';
  error?: string;
}

interface UseAgentHealthOptions {
  projectId: string;
  enabled?: boolean;
  pollingInterval?: number;
}

/**
 * Hook to poll agent health status
 * Returns the current health status of the sandbox agent
 */
export function useAgentHealth({
  projectId,
  enabled = true,
  pollingInterval = 10000, // Poll every 10 seconds by default
}: UseAgentHealthOptions) {
  const isEnabled = enabled && Boolean(projectId);

  return useQuery<AgentHealthStatus>({
    queryKey: ['agent-health', projectId],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/sandbox/health`);
      if (!response.ok) {
        throw new Error('Failed to check agent health');
      }
      return response.json();
    },
    enabled: isEnabled,
    refetchInterval: isEnabled ? pollingInterval : false,
    staleTime: pollingInterval / 2,
    // Don't retry too aggressively for health checks
    retry: 1,
    retryDelay: 1000,
    // Keep showing the last known status while refetching
    placeholderData: previousData => previousData,
  });
}
