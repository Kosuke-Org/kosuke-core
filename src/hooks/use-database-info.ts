import type { DatabaseInfo } from '@/lib/sandbox/types';
import { useQuery } from '@tanstack/react-query';

export function useDatabaseInfo(projectId: string, sessionId: string) {
  return useQuery({
    queryKey: ['database-info', projectId, sessionId],
    queryFn: async (): Promise<DatabaseInfo> => {
      const url = `/api/projects/${projectId}/chat-sessions/${sessionId}/database/info`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch database info');
      }
      const data = await response.json();
      return data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 1,
    enabled: Boolean(sessionId), // Only fetch when sessionId is provided
  });
}
