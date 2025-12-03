import type {
  ApiChatMessage,
  ContentBlock,
  ErrorType,
  MessageOptions,
  StreamingEvent,
} from '@/lib/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

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

            // Handle content block lifecycle events
            if (data.type === 'content_block_start') {
              // Create new sequential content block
              const newBlock: ContentBlock = {
                id: `block-${assistantMessageId}-${Date.now()}-${contentBlocks.length}`,
                index: contentBlocks.length,
                type: 'text', // Default, will be updated based on deltas
                content: '',
                status: 'streaming',
                timestamp: new Date(),
              };

              // Always append sequentially
              contentBlocks.push(newBlock);

              // Notify callback
              if (contentBlockCallback) {
                contentBlockCallback([...contentBlocks]);
              }
            } else if (data.type === 'content_block_delta') {
              // Find the last streaming block that matches the content type
              let targetBlock: ContentBlock | null = null;

              if (data.delta_type === 'thinking_delta') {
                // Find last streaming thinking block or create new one
                for (let i = contentBlocks.length - 1; i >= 0; i--) {
                  if (
                    contentBlocks[i].type === 'thinking' &&
                    contentBlocks[i].status === 'streaming'
                  ) {
                    targetBlock = contentBlocks[i];
                    break;
                  }
                }

                if (!targetBlock) {
                  // Create new thinking block if none exists
                  targetBlock = {
                    id: `thinking-${assistantMessageId}-${Date.now()}`,
                    index: contentBlocks.length,
                    type: 'thinking',
                    content: '',
                    status: 'streaming',
                    timestamp: new Date(),
                  };
                  contentBlocks.push(targetBlock);
                }

                if (data.thinking) {
                  targetBlock.content += data.thinking;
                }
              } else if (data.delta_type === 'text_delta') {
                // Find last streaming text block or create new one
                for (let i = contentBlocks.length - 1; i >= 0; i--) {
                  if (contentBlocks[i].type === 'text' && contentBlocks[i].status === 'streaming') {
                    targetBlock = contentBlocks[i];
                    break;
                  }
                }

                if (!targetBlock) {
                  // Create new text block if none exists
                  targetBlock = {
                    id: `text-${assistantMessageId}-${Date.now()}`,
                    index: contentBlocks.length,
                    type: 'text',
                    content: '',
                    status: 'streaming',
                    timestamp: new Date(),
                  };
                  contentBlocks.push(targetBlock);
                }

                if (data.text) {
                  targetBlock.content += data.text;
                }
              }

              // Notify callback
              if (contentBlockCallback) {
                contentBlockCallback([...contentBlocks]);
              }
            } else if (data.type === 'content_block_stop') {
              // Find and finalize the last streaming text/thinking block (NOT tool blocks)
              // Tool blocks are only completed by tool_stop events
              let lastStreamingBlock: ContentBlock | null = null;
              for (let i = contentBlocks.length - 1; i >= 0; i--) {
                const block = contentBlocks[i];
                if (block.status === 'streaming' && block.type !== 'tool') {
                  lastStreamingBlock = block;
                  break;
                }
              }

              if (lastStreamingBlock) {
                // Finalize content block
                lastStreamingBlock.status = 'completed';

                // Auto-collapse thinking blocks immediately
                if (lastStreamingBlock.type === 'thinking') {
                  lastStreamingBlock.isCollapsed = true;
                }

                // Notify callback
                if (contentBlockCallback) {
                  contentBlockCallback([...contentBlocks]);
                }
              }
            } else if (data.type === 'tool_start') {
              // Create tool content block inline
              if (data.tool_name) {
                const toolBlock: ContentBlock = {
                  id: data.tool_id
                    ? `tool-${data.tool_id}`
                    : `tool-${assistantMessageId}-${data.tool_name}-${Date.now()}`,
                  index: contentBlocks.length,
                  type: 'tool',
                  content: `Executing ${data.tool_name}...`,
                  status: 'streaming',
                  timestamp: new Date(),
                  toolName: data.tool_name,
                  toolInput: data.tool_input, // Include tool input for file path extraction
                  toolId: data.tool_id, // Store tool ID for matching with tool_stop
                };

                contentBlocks.push(toolBlock);

                // Notify callback
                if (contentBlockCallback) {
                  contentBlockCallback([...contentBlocks]);
                }
              }
            } else if (data.type === 'tool_stop') {
              // Find and finalize the streaming tool with matching ID
              if (data.tool_id) {
                let toolBlock: ContentBlock | null = null;
                for (let i = contentBlocks.length - 1; i >= 0; i--) {
                  if (
                    contentBlocks[i].type === 'tool' &&
                    contentBlocks[i].status === 'streaming' &&
                    contentBlocks[i].toolId === data.tool_id
                  ) {
                    toolBlock = contentBlocks[i];
                    break;
                  }
                }

                if (toolBlock) {
                  toolBlock.status = data.is_error ? 'error' : 'completed';
                  toolBlock.toolResult =
                    data.tool_result || data.result || 'Tool completed successfully';

                  // Notify callback
                  if (contentBlockCallback) {
                    contentBlockCallback([...contentBlocks]);
                  }
                }
              }
            } else if (data.type === 'task_summary') {
              // Add task summary as final content block
              if (data.summary) {
                const summaryBlock: ContentBlock = {
                  id: `summary-${assistantMessageId}`,
                  index: contentBlocks.length,
                  type: 'text',
                  content: `**Task Summary:**\n${data.summary}`,
                  status: 'completed',
                  timestamp: new Date(),
                };

                contentBlocks.push(summaryBlock);

                // Notify callback
                if (contentBlockCallback) {
                  contentBlockCallback([...contentBlocks]);
                }
              }
            } else if (data.type === 'message_complete') {
              // Handle message completion
              isStreamActive = false;
              if (onStreamEnd) onStreamEnd();
              break;
            } else if (data.type === 'error') {
              // Handle errors
              console.error('Streaming error');
              isStreamActive = false;
              if (onStreamEnd) onStreamEnd();
              throw new Error('Streaming error');
            } else if (data.type === 'completed') {
              // Legacy completion handling
              isStreamActive = false;
              if (onStreamEnd) onStreamEnd();
              break;
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
      // Ensure we have a sessionId for the new endpoint
      if (!sessionId) {
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
        // onStreamEnd: flip streaming to false and set expectingWebhookUpdate
        // This keeps the streaming content visible until the saved message appears
        () => {
          setStreamingState(prev => ({
            ...prev,
            isStreaming: false,
            expectingWebhookUpdate: true,
          }));
        },
        abortController,
        sessionId
      );
    },
    onMutate: async newMessage => {
      // Cancel any outgoing refetches for session-specific queries
      await queryClient.cancelQueries({
        queryKey: ['chat-session-messages', projectId, sessionId],
      });

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData([
        'chat-session-messages',
        projectId,
        sessionId,
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
          ['chat-session-messages', projectId, sessionId],
          (old: { messages?: ApiChatMessage[] } | undefined) => ({
            ...(old || {}),
            messages: [...((old?.messages as ApiChatMessage[] | undefined) || []), userMessage],
          })
        );
      }

      return { previousMessages };
    },
    onError: (error, _, context) => {
      // If there's an error, roll back to the previous state
      if (context?.previousMessages) {
        queryClient.setQueryData(
          ['chat-session-messages', projectId, sessionId],
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
      // Mark that we're expecting a webhook update
      setStreamingState(prev => ({
        ...prev,
        expectingWebhookUpdate: true,
      }));

      // If this was an image upload (non-streaming), invalidate queries immediately
      if (data.expectingWebhookUpdate === false) {
        queryClient.invalidateQueries({
          queryKey: ['chat-session-messages', projectId, sessionId],
        });

        // Update session list to reflect new message count
        queryClient.invalidateQueries({ queryKey: ['chat-sessions', projectId] });
      }
    },
    onSettled: () => {
      // Add a delay before invalidating queries to allow webhook to save data
      setTimeout(async () => {
        // Invalidate and wait for the query to settle before clearing streaming state
        await queryClient.invalidateQueries({
          queryKey: ['chat-session-messages', projectId, sessionId],
        });

        // Also invalidate session list to update message counts
        await queryClient.invalidateQueries({ queryKey: ['chat-sessions', projectId] });

        // Always trigger preview refresh after streaming finishes and we fetch the assistant message
        const fileUpdatedEvent = new CustomEvent('file-updated', {
          detail: { projectId },
        });
        window.dispatchEvent(fileUpdatedEvent);

        // Add small delay to ensure new data is rendered
        setTimeout(() => {
          setStreamingState({
            isStreaming: false,
            expectingWebhookUpdate: false,
            streamingContentBlocks: [],
            streamingAssistantMessageId: null,
            streamAbortController: null,
          });
        }, 100); // Small delay to ensure smooth transition
      }, 2000); // 2 second delay to allow webhook to complete
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
