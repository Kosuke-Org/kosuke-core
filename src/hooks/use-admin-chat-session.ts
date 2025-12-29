import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToast } from '@/hooks/use-toast';

import type {
  AdminSessionDetail,
  AdminSessionMessagesResponse,
  UseAdminChatSessionOptions,
  UseAdminChatSessionReturn,
} from '@/lib/types';

export function useAdminChatSession({
  sessionId,
}: UseAdminChatSessionOptions): UseAdminChatSessionReturn {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch session details
  const { data: sessionData, isLoading: isLoadingSession } = useQuery<{
    session: AdminSessionDetail;
  }>({
    queryKey: ['admin-chat-session', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/chat-sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session');
      const result = await response.json();
      return result.data;
    },
  });

  // Fetch messages
  const { data: messagesData, isLoading: isLoadingMessages } =
    useQuery<AdminSessionMessagesResponse>({
      queryKey: ['admin-chat-session-messages', sessionId],
      queryFn: async () => {
        const response = await fetch(`/api/admin/chat-sessions/${sessionId}/messages`);
        if (!response.ok) throw new Error('Failed to fetch messages');
        const result = await response.json();
        return result.data;
      },
      refetchInterval: 5000, // Poll every 5 seconds for new messages
    });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`/api/admin/chat-sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error('Failed to send message');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-chat-session-messages', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['admin-chat-session', sessionId] });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive',
      });
    },
  });

  // Toggle mode mutation
  const toggleModeMutation = useMutation({
    mutationFn: async (mode: 'autonomous' | 'human_assisted') => {
      const response = await fetch(`/api/admin/chat-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) throw new Error('Failed to update mode');
      return response.json();
    },
    onSuccess: (_, mode) => {
      queryClient.invalidateQueries({ queryKey: ['admin-chat-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['admin-chat-session-messages', sessionId] });
      toast({
        title: 'Mode updated',
        description:
          mode === 'human_assisted'
            ? 'Session is now in human-assisted mode'
            : 'Session is now in autonomous mode',
      });
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update mode',
        variant: 'destructive',
      });
    },
  });

  return {
    // Session data
    session: sessionData?.session,
    isLoadingSession,

    // Messages data
    messages: messagesData?.messages || [],
    isLoadingMessages,

    // Mutations
    sendMessage: sendMessageMutation.mutate,
    isSendingMessage: sendMessageMutation.isPending,

    toggleMode: toggleModeMutation.mutate,
    isTogglingMode: toggleModeMutation.isPending,
  };
}
