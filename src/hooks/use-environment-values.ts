import type { ProjectStatus } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';

interface EnvironmentResponse {
  environment: Record<string, string>;
  path: string;
  projectId: string;
  status: ProjectStatus;
}

interface UseEnvironmentValuesOptions {
  projectStatus?: ProjectStatus;
  enabled?: boolean;
}

/**
 * Hook to fetch environment values from kosuke.config.json
 * Returns key-value pairs of environment variables
 *
 * Polls every 5 seconds while project is in 'requirements_ready' status
 * to keep values in sync with sandbox updates
 */
export function useEnvironmentValues(projectId: string, options?: UseEnvironmentValuesOptions) {
  const { projectStatus, enabled = true } = options ?? {};
  const shouldPoll = projectStatus === 'requirements_ready';

  return useQuery({
    queryKey: ['environment-values', projectId],
    queryFn: async (): Promise<Record<string, string>> => {
      const response = await fetch(`/api/projects/${projectId}/environment`);
      if (!response.ok) {
        throw new Error('Failed to fetch environment values');
      }
      const data: EnvironmentResponse = await response.json();
      return data.environment || {};
    },
    enabled,
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: shouldPoll ? 5000 : false, // Poll every 5 seconds when in environments status
    refetchIntervalInBackground: false, // Don't poll when tab is hidden
    retry: 2,
  });
}
