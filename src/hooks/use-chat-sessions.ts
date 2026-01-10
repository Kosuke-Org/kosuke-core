import { useToast } from '@/hooks/use-toast';
import type {
  ChatSession,
  ChatSessionListResponse,
  ChatSessionMessagesResponse,
  CreateChatSessionData,
  UpdateChatSessionData,
} from '@/lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Hook to get all chat sessions for a project
export function useChatSessions(projectId: string) {
  return useQuery({
    queryKey: ['chat-sessions', projectId],
    queryFn: async (): Promise<ChatSession[]> => {
      const response = await fetch(`/api/projects/${projectId}/chat-sessions`);
      if (!response.ok) {
        throw new Error('Failed to fetch chat sessions');
      }
      const data: ChatSessionListResponse = await response.json();
      return data.sessions;
    },
    staleTime: 1000 * 30, // 30 seconds
    retry: 2,
  });
}

// Hook to get messages for a specific chat session
export function useChatSessionMessages(projectId: string, sessionId: string) {
  const query = useQuery({
    queryKey: ['chat-session-messages', projectId, sessionId],
    queryFn: async (): Promise<ChatSessionMessagesResponse> => {
      const response = await fetch(
        `/api/projects/${projectId}/chat-sessions/${sessionId}/messages`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch chat session messages');
      }
      return response.json();
    },
    enabled: !!sessionId,
    staleTime: 1000 * 30, // 30 seconds
    // Poll every 1.5 seconds when there are thinking messages (assistant with null content)
    // Fast polling ensures quick updates when streaming ends
    refetchInterval: query => {
      const messages = query.state.data?.messages;
      const hasThinkingMessages = messages?.some(
        m => m.role === 'assistant' && !m.content && (!m.blocks || m.blocks.length === 0)
      );
      return hasThinkingMessages ? 1500 : false;
    },
  });

  return query;
}

// Hook to create a new chat session
export function useCreateChatSession(projectId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateChatSessionData) => {
      const response = await fetch(`/api/projects/${projectId}/chat-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create chat session');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions', projectId] });
      toast({
        title: 'Success',
        description: 'Chat session created successfully',
      });
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

// Hook to update a chat session
export function useUpdateChatSession(projectId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, data }: { sessionId: string; data: UpdateChatSessionData }) => {
      const response = await fetch(`/api/projects/${projectId}/chat-sessions/${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update chat session');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions', projectId] });
      toast({
        title: 'Success',
        description: 'Chat session updated successfully',
      });
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

// Hook to delete a chat session
export function useDeleteChatSession(projectId: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chatSessionId: string) => {
      // chatSessionId here is the UUID id used for API routing
      const response = await fetch(`/api/projects/${projectId}/chat-sessions/${chatSessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete chat session');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-sessions', projectId] });
      toast({
        title: 'Success',
        description: 'Chat session deleted successfully',
      });
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
