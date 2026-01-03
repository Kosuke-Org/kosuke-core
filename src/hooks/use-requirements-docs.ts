import type { ProjectStatus, RequirementsDocsResponse } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';

interface UseRequirementsDocsOptions {
  projectStatus?: ProjectStatus;
}

/**
 * Hook to fetch the requirements document content for a project
 * Returns markdown string for preview
 *
 * Polls every 5 seconds while project is in 'requirements' status
 * to keep the preview in sync with sandbox updates
 */
export function useRequirementsDocs(projectId: string, options?: UseRequirementsDocsOptions) {
  const { projectStatus } = options ?? {};
  const shouldPoll = projectStatus === 'requirements';

  return useQuery({
    queryKey: ['requirements-docs', projectId],
    queryFn: async (): Promise<string> => {
      const response = await fetch(`/api/projects/${projectId}/requirements`);
      if (!response.ok) {
        throw new Error('Failed to fetch requirements docs');
      }
      const data: RequirementsDocsResponse = await response.json();
      return data.docs || '';
    },
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: shouldPoll ? 5000 : false, // Poll every 5 seconds when in requirements status
    refetchIntervalInBackground: false, // Don't poll when tab is hidden
    retry: 2,
  });
}
