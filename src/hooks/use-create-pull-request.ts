import { useToast } from '@/hooks/use-toast';
import type { CreatePullRequestData, CreatePullRequestResponse } from '@/lib/types';
import { useMutation } from '@tanstack/react-query';

// Hook to create pull request from chat session
export function useCreatePullRequest(projectId: string) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      sessionId,
      data,
    }: {
      sessionId: string;
      data: CreatePullRequestData;
    }): Promise<CreatePullRequestResponse> => {
      const response = await fetch(
        `/api/projects/${projectId}/chat-sessions/${sessionId}/pull-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create pull request');
      }

      return response.json();
    },
    onSuccess: data => {
      toast({
        title: 'Pull Request Created',
        description: 'Opening pull request on GitHub...',
      });

      // Open GitHub PR in new tab
      window.open(data.pull_request_url, '_blank');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
