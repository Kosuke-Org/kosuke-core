import type {
  ApiChatMessage,
  ContentBlock,
  ErrorType,
  MessageOptions,
  StreamingEvent,
  ToolInput,
} from '@/lib/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

// Send message function with streaming support
const sendMessage = async (
  projectId: string,
  content: string,
  options?: MessageOptions,
  contentBlockCallback?: (contentBlocks: ContentBlock[]) => void,
  setAssistantIdCallback?: (id: string) => void,
  onStreamEnd?: () => void,
  abortController?: AbortController,
  sessionId?: string | null
): Promise<{
  message: ApiChatMessage;
  success: boolean;
  fileUpdated?: boolean;
  totalTokensInput?: number;
  totalTokensOutput?: number;
  contextTokens?: number;
  error?: string;
  errorType?: ErrorType;
  expectingWebhookUpdate?: boolean;
}> => {
  try {
    // Ensure we have a sessionId
    if (!sessionId) {
      throw new Error('Session ID is required for sending messages');
    }

    // Prepare request body - use FormData for file attachments, JSON for text only
    let requestBody: FormData | string;
    const requestHeaders: HeadersInit = {};

    if (options?.attachments && options.attachments.length > 0) {
      // For file uploads, use FormData
      const formData = new FormData();
      formData.append('content', content);
      formData.append('includeContext', options.includeContext ? 'true' : 'false');

      if (options.contextFiles && options.contextFiles.length) {
        formData.append('contextFiles', JSON.stringify(options.contextFiles));
      }

      // Append all attachments
      options.attachments.forEach((file, index) => {
        formData.append(`attachment_${index}`, file);
      });
      formData.append('attachmentCount', String(options.attachments.length));

      requestBody = formData;
    } else {
      // For text messages, use JSON
      requestHeaders['Content-Type'] = 'application/json';
      requestBody = JSON.stringify({
        content,
        includeContext: options?.includeContext || false,
        contextFiles: options?.contextFiles || [],
      });
    }

    // Send request - both text and images now use streaming
    const response = await fetch(`/api/projects/${projectId}/chat-sessions/${sessionId}`, {
      method: 'POST',
      headers: requestHeaders,
      body: requestBody,
      signal: abortController?.signal,
    });

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('LIMIT_REACHED');
      }

      const errorData = await response.json().catch(() => ({}));
      if (errorData && typeof errorData === 'object' && 'errorType' in errorData) {
        const error = new Error(errorData.error || 'Failed to send message');
        Object.assign(error, { errorType: errorData.errorType });
        throw error;
      }

      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    // Handle streaming response (for both text and image messages)
    if (!response.body) {
      throw new Error('No response body');
    }

    // Extract assistant message ID from response headers for real-time updates
    const assistantMessageId = response.headers.get('X-Assistant-Message-Id') || '';

    // Notify callback with assistant message ID
    if (setAssistantIdCallback) {
      setAssistantIdCallback(assistantMessageId);
    }

    // Start streaming and update UI in real-time with action parsing
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Track streaming state and content blocks
    let isStreamActive = true;
    const contentBlocks: ContentBlock[] = [];

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
              if (onStreamEnd) onStreamEnd();
              break;
            }

            // Skip empty or invalid data
            if (!rawData.trim() || rawData.trim() === '{}' || rawData.startsWith('{,')) {
              continue;
            }

            // Parse JSON data directly (backend now sends proper JSON)
            let data: StreamingEvent;
            try {
              data = JSON.parse(rawData);
            } catch (parseError) {
              const errorMessage =
                parseError instanceof Error ? parseError.message : 'Unknown parsing error';
              console.warn(
                'Failed to parse streaming JSON:',
                errorMessage,
                'Data:',
                rawData.substring(0, 200) + '...'
              );
              continue;
            }

            // Handle kosuke-cli events
            if (data.type === 'tool_call') {
              // Tool call from kosuke-cli: { type: 'tool_call', data: { action, params } }
              const toolData = data.data as
                | { action?: string; params?: Record<string, unknown> }
                | undefined;

              // Format tool call content with relevant params
              let toolContent = `${toolData?.action || 'Tool'}`;
              if (toolData?.params) {
                // Extract key params for display
                if (toolData.params.path) {
                  toolContent += `: ${toolData.params.path}`;
                } else if (toolData.params.pattern) {
                  toolContent += `: ${toolData.params.pattern}`;
                } else if (toolData.params.file_path) {
                  toolContent += `: ${toolData.params.file_path}`;
                } else if (toolData.params.query) {
                  toolContent += `: ${toolData.params.query}`;
                }
              }

              const toolBlock: ContentBlock = {
                id: `tool-${assistantMessageId}-${Date.now()}-${contentBlocks.length}`,
                index: contentBlocks.length,
                type: 'tool',
                content: toolContent,
                status: 'completed',
                timestamp: new Date(),
                toolName: toolData?.action,
                toolInput: toolData?.params as ToolInput | undefined,
              };

              contentBlocks.push(toolBlock);

              if (contentBlockCallback) {
                contentBlockCallback([...contentBlocks]);
              }
            } else if (data.type === 'message') {
              // Message from kosuke-cli: { type: 'message', data: { type: 'assistant', text, ... } }
              const messageData = data.data as { text?: string; type?: string };

              if (messageData?.text) {
                // Create or update text block
                let textBlock = contentBlocks.find(
                  b => b.type === 'text' && b.status === 'streaming'
                );

                if (!textBlock) {
                  textBlock = {
                    id: `text-${assistantMessageId}-${Date.now()}`,
                    index: contentBlocks.length,
                    type: 'text',
                    content: '',
                    status: 'streaming',
                    timestamp: new Date(),
                  };
                  contentBlocks.push(textBlock);
                }

                // Append text (messages come as complete chunks, not deltas)
                textBlock.content += messageData.text + '\n\n';
                textBlock.status = 'completed';

                if (contentBlockCallback) {
                  contentBlockCallback([...contentBlocks]);
                }
              }
            } else if (data.type === 'build_started') {
              // Build started event
              const buildData = data.data as { totalTickets?: number };
              const textBlock: ContentBlock = {
                id: `build-start-${assistantMessageId}`,
                index: contentBlocks.length,
                type: 'text',
                content: `🏗️ Starting build with ${buildData?.totalTickets || 0} tickets...`,
                status: 'completed',
                timestamp: new Date(),
              };
              contentBlocks.push(textBlock);
              if (contentBlockCallback) contentBlockCallback([...contentBlocks]);
            } else if (data.type === 'ticket_started') {
              // Ticket started event
              const ticketData = data.data as {
                ticket?: { title?: string };
                index?: number;
                total?: number;
              };
              const textBlock: ContentBlock = {
                id: `ticket-${assistantMessageId}-${ticketData?.index}`,
                index: contentBlocks.length,
                type: 'text',
                content: `\n📝 Ticket ${ticketData?.index}/${ticketData?.total}: ${ticketData?.ticket?.title}`,
                status: 'streaming',
                timestamp: new Date(),
              };
              contentBlocks.push(textBlock);
              if (contentBlockCallback) contentBlockCallback([...contentBlocks]);
            } else if (data.type === 'ticket_completed') {
              // Mark last ticket as completed
              const lastTicket = contentBlocks.findLast(b => b.content?.includes('📝 Ticket'));
              if (lastTicket) {
                lastTicket.status = 'completed';
                if (contentBlockCallback) contentBlockCallback([...contentBlocks]);
              }
            } else if (data.type === 'ship_tool_call' || data.type === 'test_tool_call') {
              // Sub-phase tool calls (ship/test) - less verbose
              const toolData = data.data as { action?: string };
              console.log(`[${data.type}] ${toolData?.action}`);
            } else if (data.type === 'done') {
              // Done event from kosuke-cli: { type: 'done', data: { status, message?, ... } }
              const doneData = data.data as {
                status?: string;
                message?: string;
                buildJobId?: string;
                error?: string;
              };

              // If there's a clarification message or error, add it as text
              if (doneData?.message) {
                const textBlock: ContentBlock = {
                  id: `done-${assistantMessageId}-${Date.now()}`,
                  index: contentBlocks.length,
                  type: 'text',
                  content: doneData.message,
                  status: 'completed',
                  timestamp: new Date(),
                };

                contentBlocks.push(textBlock);

                if (contentBlockCallback) {
                  contentBlockCallback([...contentBlocks]);
                }
              }

              if (doneData?.error) {
                console.error('Error:', doneData.error);
              }

              // Stream is complete - onStreamEnd will clear streaming state
              isStreamActive = false;
              if (onStreamEnd) onStreamEnd();
              break;
            } else if (data.type === 'error') {
              // Handle errors
              console.error('Streaming error:', data.data);
              isStreamActive = false;
              if (onStreamEnd) onStreamEnd();
              throw new Error('Streaming error');
            }
          } catch (outerError) {
            // This catches any unexpected errors in the streaming processing
            console.warn('Unexpected streaming error:', outerError);
            continue;
          }
        }
      }
    }

    // Combine all content blocks for final message storage
    let finalContent = '';
    for (const block of contentBlocks) {
      if (block.type === 'thinking') {
        finalContent += `<thinking>\n${block.content}\n</thinking>\n\n`;
      } else if (block.type === 'text') {
        finalContent += block.content + '\n\n';
      } else if (block.type === 'tool' && block.toolResult) {
        // Include tool results in final content for context
        finalContent += `[Tool: ${block.toolName}]\n${block.toolResult}\n\n`;
      }
    }

    // Mark that we're expecting a webhook update

    // Return success response with assistant message ID
    return {
      message: {
        id: assistantMessageId,
        content: finalContent.trim(),
        role: 'assistant',
        timestamp: new Date(),
        projectId,
        userId: '', // Will be populated by the backend
      } as ApiChatMessage,
      success: true,
      expectingWebhookUpdate: true,
    };
  } catch (error) {
    console.error('Error in sendMessage:', error);
    throw error;
  }
};

// Hook for sending messages with streaming support
export function useSendMessage(
  projectId: string,
  activeChatSessionId?: string | null,
  sessionId?: string | null
) {
  const queryClient = useQueryClient();

  // Use ref to always get the latest sessionId (avoid stale closure)
  const sessionIdRef = useRef(sessionId);

  // Update ref when sessionId changes
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Streaming state (minimal React state for real-time updates)
  const [streamingState, setStreamingState] = useState({
    isStreaming: false,
    expectingWebhookUpdate: false,
    streamingContentBlocks: [] as ContentBlock[],
    streamingAssistantMessageId: null as string | null,
    streamAbortController: null as AbortController | null,
  });

  // Function to cancel ongoing stream
  const cancelStream = useCallback(() => {
    if (streamingState.streamAbortController) {
      streamingState.streamAbortController.abort();
      setStreamingState({
        isStreaming: false,
        expectingWebhookUpdate: false,
        streamingContentBlocks: [],
        streamingAssistantMessageId: null,
        streamAbortController: null,
      });
    }
  }, [streamingState.streamAbortController]);

  // Mutation for sending messages
  const mutation = useMutation({
    mutationFn: (args: { content: string; options?: MessageOptions }) => {
      // Get current sessionId from ref (avoids stale closure)
      const currentSessionId = sessionIdRef.current;

      // Ensure we have a sessionId for the new endpoint
      if (!currentSessionId) {
        throw new Error('Session ID is required for sending messages');
      }

      // Set up streaming state and callback
      const abortController = new AbortController();

      setStreamingState(prev => ({
        ...prev,
        isStreaming: true,
        expectingWebhookUpdate: false,
        streamingContentBlocks: [],
        streamAbortController: abortController,
      }));

      // Create content block callback for real-time updates
      const contentBlockCallback = (contentBlocks: ContentBlock[]) => {
        setStreamingState(prev => ({
          ...prev,
          streamingContentBlocks: contentBlocks,
        }));
      };

      // Create assistant ID callback
      const setAssistantIdCallback = (id: string) => {
        setStreamingState(prev => ({
          ...prev,
          streamingAssistantMessageId: id,
        }));
      };

      return sendMessage(
        projectId,
        args.content,
        args.options,
        contentBlockCallback,
        setAssistantIdCallback,
        // onStreamEnd: flip streaming to false immediately on stream completion
        () => {
          setStreamingState(prev => ({
            ...prev,
            isStreaming: false,
          }));
        },
        abortController,
        currentSessionId
      );
    },
    onMutate: async newMessage => {
      // Get current sessionId from ref
      const currentSessionId = sessionIdRef.current;

      // Cancel any outgoing refetches for session-specific queries
      await queryClient.cancelQueries({
        queryKey: ['chat-session-messages', projectId, currentSessionId],
      });

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData([
        'chat-session-messages',
        projectId,
        currentSessionId,
      ]);

      // Optimistically add the user message
      if (previousMessages) {
        // Create optimistic attachment objects if files are present
        const optimisticAttachments = await Promise.all(
          (newMessage.options?.attachments || []).map(async (file, index) => {
            // Create blob URL for the actual file (for opening/downloading)
            const blobUrl = URL.createObjectURL(file);

            return {
              id: `temp-${Date.now()}-${index}`,
              projectId,
              filename: file.name,
              storedFilename: file.name,
              fileUrl: blobUrl, // Use blob URL so clicking opens the actual file
              fileType: file.type.startsWith('image/') ? ('image' as const) : ('document' as const),
              mediaType: file.type,
              fileSize: file.size,
              createdAt: new Date(),
            };
          })
        );

        const userMessage = {
          id: Date.now(), // Temporary ID
          content: newMessage.content,
          role: 'user' as const,
          timestamp: new Date(),
          modelType: 'premium',
          projectId,
          chatSessionId: activeChatSessionId,
          userId: 'current-user', // Will be replaced by server
          tokensInput: 0,
          tokensOutput: 0,
          contextTokens: 0,
          attachments: optimisticAttachments, // Add optimistic attachments
        };

        queryClient.setQueryData(
          ['chat-session-messages', projectId, currentSessionId],
          (old: { messages?: ApiChatMessage[] } | undefined) => ({
            ...(old || {}),
            messages: [...((old?.messages as ApiChatMessage[] | undefined) || []), userMessage],
          })
        );
      }

      return { previousMessages };
    },
    onError: (error, _, context) => {
      // Get current sessionId from ref
      const currentSessionId = sessionIdRef.current;

      // If there's an error, roll back to the previous state
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['chat-session-messages', projectId, currentSessionId],
          context.previousMessages
        );
      }

      // Clear streaming state on error
      setStreamingState({
        isStreaming: false,
        expectingWebhookUpdate: false,
        streamingContentBlocks: [],
        streamingAssistantMessageId: null,
        streamAbortController: null,
      });

      console.error('Message sending failed:', error);
    },
    onSuccess: data => {
      // Get current sessionId from ref
      const currentSessionId = sessionIdRef.current;

      // Mark that we're expecting a webhook update
      setStreamingState(prev => ({
        ...prev,
        expectingWebhookUpdate: true,
      }));

      // If this was an image upload (non-streaming), invalidate queries immediately
      if (data.expectingWebhookUpdate === false) {
        queryClient.invalidateQueries({
          queryKey: ['chat-session-messages', projectId, currentSessionId],
        });

        // Update session list to reflect new message count
        queryClient.invalidateQueries({ queryKey: ['chat-sessions', projectId] });
      }
    },
    onSettled: () => {
      // Get current sessionId from ref
      const currentSessionId = sessionIdRef.current;

      // Clear streaming state and refresh queries after message is saved
      setTimeout(async () => {
        // Invalidate queries to refresh with final message from database
        await queryClient.invalidateQueries({
          queryKey: ['chat-session-messages', projectId, currentSessionId],
        });

        // Also invalidate session list to update message counts
        await queryClient.invalidateQueries({ queryKey: ['chat-sessions', projectId] });

        // Trigger preview refresh after streaming finishes
        const fileUpdatedEvent = new CustomEvent('file-updated', {
          detail: { projectId },
        });
        window.dispatchEvent(fileUpdatedEvent);

        // Clear streaming state to hide streaming UI
        setStreamingState({
          isStreaming: false,
          expectingWebhookUpdate: false,
          streamingContentBlocks: [],
          streamingAssistantMessageId: null,
          streamAbortController: null,
        });
      }, 1000); // Short delay to ensure message is saved to database
    },
  });

  return {
    sendMessage: mutation.mutate,
    isLoading: mutation.isPending,
    error: mutation.error,
    ...streamingState,
    cancelStream,
  };
}
