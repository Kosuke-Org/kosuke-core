import type { RequirementsDocsResponse } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';

/**
 * Hook to fetch the requirements document content for a project
 * Returns markdown string for preview
 */
export function useRequirementsDocs(projectId: string) {
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
    retry: 2,
  });
}
