import type { RequirementsMessage, RequirementsMessagesResponse } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';

/**
 * Hook to fetch requirements messages for a project
 * Used during the requirements gathering phase
 */
export function useRequirementsMessages(projectId: string) {
  return useQuery({
    queryKey: ['requirements-messages', projectId],
    queryFn: async (): Promise<RequirementsMessage[]> => {
      const response = await fetch(`/api/projects/${projectId}/requirements/messages`);
      if (!response.ok) {
        throw new Error('Failed to fetch requirements messages');
      }
      const data: RequirementsMessagesResponse = await response.json();
      return (data.messages || []).map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
    },
    staleTime: 1000 * 30, // 30 seconds
    retry: 2,
  });
}
