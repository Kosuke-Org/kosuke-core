import { REQUIREMENTS_EVENTS } from '@Kosuke-Org/cli';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { useToast } from '@/hooks/use-toast';
import type { ContentBlock, RequirementsMessage, ToolInput } from '@/lib/types';

interface RequirementsStreamingState {
  isStreaming: boolean;
  streamingContentBlocks: ContentBlock[];
  streamingAssistantMessageId: string | null;
}

interface StreamingEvent {
  type: string;
  data?: Record<string, unknown>;
}

/**
 * Hook to send a message in the requirements chat with SSE streaming support
 * Includes optimistic updates for immediate UI feedback
 */
export function useSendRequirementsMessage(projectId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Streaming state
  const [streamingState, setStreamingState] = useState<RequirementsStreamingState>({
    isStreaming: false,
    streamingContentBlocks: [],
    streamingAssistantMessageId: null,
  });

  // Abort controller for cancellation
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Cancel stream function
  const cancelStream = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setStreamingState({
        isStreaming: false,
        streamingContentBlocks: [],
        streamingAssistantMessageId: null,
      });
      setAbortController(null);
    }
  }, [abortController]);

  const mutation = useMutation({
    mutationFn: async (
      content: string
    ): Promise<{ message: RequirementsMessage; docs?: string }> => {
      // Create abort controller for this request
      const controller = new AbortController();
      setAbortController(controller);

      // Initialize streaming state
      setStreamingState({
        isStreaming: true,
        streamingContentBlocks: [],
        streamingAssistantMessageId: `temp-assistant-${Date.now()}`,
      });

      const response = await fetch(`/api/projects/${projectId}/requirements/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      // Check if this is a streaming response
      const contentType = response.headers.get('Content-Type');
      if (!contentType?.includes('text/event-stream')) {
        // Non-streaming fallback
        return response.json();
      }

      // Handle SSE streaming response
      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let isStreamActive = true;
      const contentBlocks: ContentBlock[] = [];
      let finalMessage: RequirementsMessage | null = null;
      let docs: string | undefined;

      while (isStreamActive) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const rawData = line.substring(6);

              // Handle [DONE] marker
              if (rawData === '[DONE]') {
                isStreamActive = false;
                break;
              }

              // Skip empty or invalid data
              if (!rawData.trim() || rawData.trim() === '{}') {
                continue;
              }

              // Parse JSON data
              let data: StreamingEvent;
              try {
                data = JSON.parse(rawData);
              } catch {
                console.warn('Failed to parse streaming JSON:', rawData.substring(0, 100));
                continue;
              }

              // Handle different event types
              if (data.type === REQUIREMENTS_EVENTS.TOOL_CALL) {
                const toolData = data.data as { action?: string; params?: Record<string, unknown> };

                // Format tool call content
                let toolContent = `${toolData?.action || 'Tool'}`;
                if (toolData?.params) {
                  if (toolData.params.path) {
                    toolContent += `: ${toolData.params.path}`;
                  } else if (toolData.params.pattern) {
                    toolContent += `: ${toolData.params.pattern}`;
                  } else if (toolData.params.file_path) {
                    toolContent += `: ${toolData.params.file_path}`;
                  }
                }

                const toolBlock: ContentBlock = {
                  id: `tool-${Date.now()}-${contentBlocks.length}`,
                  index: contentBlocks.length,
                  type: 'tool',
                  content: toolContent,
                  status: 'completed',
                  timestamp: new Date(),
                  toolName: toolData?.action,
                  toolInput: toolData?.params as ToolInput | undefined,
                };

                contentBlocks.push(toolBlock);
                setStreamingState(prev => ({
                  ...prev,
                  streamingContentBlocks: [...contentBlocks],
                }));
              } else if (data.type === REQUIREMENTS_EVENTS.MESSAGE) {
                const messageData = data.data as { text?: string };

                if (messageData?.text) {
                  // Find or create text block
                  let textBlock = contentBlocks.find(
                    b => b.type === 'text' && b.status === 'streaming'
                  );

                  if (!textBlock) {
                    textBlock = {
                      id: `text-${Date.now()}`,
                      index: contentBlocks.length,
                      type: 'text',
                      content: '',
                      status: 'streaming',
                      timestamp: new Date(),
                    };
                    contentBlocks.push(textBlock);
                  }

                  // Append text delta directly - stream sends small chunks with proper spacing included
                  textBlock.content += messageData.text;

                  setStreamingState(prev => ({
                    ...prev,
                    streamingContentBlocks: [...contentBlocks],
                  }));
                }
              } else if (data.type === REQUIREMENTS_EVENTS.DONE) {
                const doneData = data.data as {
                  message?: RequirementsMessage;
                  docsContent?: string;
                  error?: string;
                };

                if (doneData?.error) {
                  throw new Error(doneData.error);
                }

                if (doneData?.message) {
                  finalMessage = doneData.message;
                }
                docs = doneData?.docsContent;
                isStreamActive = false;
              } else if (data.type === REQUIREMENTS_EVENTS.ERROR) {
                const errorData = data.data as { error?: string };
                throw new Error(errorData?.error || 'Stream error');
              }
            } catch (outerError) {
              console.warn('Unexpected streaming error:', outerError);
              continue;
            }
          }
        }
      }

      // Clear streaming state after completion
      setStreamingState({
        isStreaming: false,
        streamingContentBlocks: [],
        streamingAssistantMessageId: null,
      });
      setAbortController(null);

      if (!finalMessage) {
        throw new Error('No message received from stream');
      }

      return { message: finalMessage, docs };
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

      // Clear streaming state on error
      setStreamingState({
        isStreaming: false,
        streamingContentBlocks: [],
        streamingAssistantMessageId: null,
      });
      setAbortController(null);

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

  return {
    ...mutation,
    ...streamingState,
    cancelStream,
  };
}
