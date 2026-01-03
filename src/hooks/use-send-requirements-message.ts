import { useToast } from '@/hooks/use-toast';
import type { RequirementsMessage } from '@/lib/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface SendRequirementsMessageResponse {
  message: RequirementsMessage;
  docs?: string;
}

/**
 * Hook to send a message in the requirements chat
 * Includes optimistic updates for immediate UI feedback
 */
export function useSendRequirementsMessage(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (content: string): Promise<SendRequirementsMessageResponse> => {
      const response = await fetch(`/api/projects/${projectId}/requirements/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      return response.json();
    },
    onMutate: async content => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['requirements-messages', projectId] });

      // Snapshot previous value
      const previous = queryClient.getQueryData<RequirementsMessage[]>([
        'requirements-messages',
        projectId,
      ]);

      // Optimistically add the user message
      queryClient.setQueryData<RequirementsMessage[]>(
        ['requirements-messages', projectId],
        (old = []) => [
          ...old,
          {
            id: `temp-${Date.now()}`,
            role: 'user',
            content,
            timestamp: new Date(),
          },
        ]
      );

      return { previous };
    },
    onError: (error: Error, _, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['requirements-messages', projectId], context.previous);
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to send message',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      // Invalidate to refetch fresh data
      queryClient.invalidateQueries({ queryKey: ['requirements-messages', projectId] });
      queryClient.invalidateQueries({ queryKey: ['requirements-docs', projectId] });
    },
  });
}
