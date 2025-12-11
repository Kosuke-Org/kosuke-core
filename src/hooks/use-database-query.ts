import { useToast } from '@/hooks/use-toast';
import type { QueryResult } from '@/lib/sandbox/types';
import { useMutation } from '@tanstack/react-query';

export function useDatabaseQuery(projectId: string, sessionId: string) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (query: string): Promise<QueryResult> => {
      const url = `/api/projects/${projectId}/chat-sessions/${sessionId}/database/query`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute query');
      }

      const data = await response.json();
      return data;
    },
    onError: error => {
      toast({
        title: 'Query Error',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSuccess: data => {
      toast({
        title: 'Query Executed',
        description: `Query returned ${data.rows} row${data.rows !== 1 ? 's' : ''}`,
      });
    },
  });
}
