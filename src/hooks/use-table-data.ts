import type { TableData } from '@/lib/sandbox/types';
import { useQuery } from '@tanstack/react-query';

export function useTableData(
  projectId: string,
  tableName: string | null,
  sessionId: string,
  limit: number = 100,
  offset: number = 0
) {
  return useQuery({
    queryKey: ['table-data', projectId, sessionId, tableName, limit, offset],
    queryFn: async (): Promise<TableData> => {
      if (!tableName) {
        throw new Error('Table name is required');
      }

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      const url = `/api/projects/${projectId}/chat-sessions/${sessionId}/database/tables/${tableName}?${params}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch table data');
      }

      const data = await response.json();
      return data;
    },
    enabled: Boolean(tableName && sessionId), // Only fetch when both tableName and sessionId are provided
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 1,
  });
}
