import type { DatabaseSchema } from '@/lib/sandbox/types';
import { useQuery } from '@tanstack/react-query';

export function useDatabaseSchema(projectId: string, sessionId: string) {
  return useQuery({
    queryKey: ['database-schema', projectId, sessionId],
    queryFn: async (): Promise<DatabaseSchema> => {
      const url = `/api/projects/${projectId}/chat-sessions/${sessionId}/database/schema`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch database schema');
      }
      const data = await response.json();
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
    enabled: Boolean(sessionId), // Only fetch when sessionId is provided
  });
}
