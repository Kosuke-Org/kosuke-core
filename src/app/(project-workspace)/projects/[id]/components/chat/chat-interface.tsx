'use client';

import { Loader2, RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useUser } from '@clerk/nextjs';

// Import types and hooks
import { useChatSessionMessages } from '@/hooks/use-chat-sessions';
import { useChatState } from '@/hooks/use-chat-state';
import { useSendMessage } from '@/hooks/use-send-message';
import type { ChatInterfaceProps } from '@/lib/types';

// Import components
import AssistantResponse from './assistant-response';
import ChatInput from './chat-input';
import ChatMessage from './chat-message';

import ModelBanner from './model-banner';

export default function ChatInterface({
  projectId,
  className,
  activeChatSessionId,
  currentBranch,
  sessionId,
}: ChatInterfaceProps) {

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // User data
  const { user: clerkUser, isLoaded } = useUser();
  const [user, setUser] = useState<{
    name?: string;
    email?: string;
    imageUrl?: string;
  } | null>(null);

  // Always call hooks at the top level, even if sessionId is not available yet
  const sendMessageMutation = useSendMessage(projectId, activeChatSessionId, sessionId || '');
  const messagesQuery = useChatSessionMessages(projectId, sessionId || '');
  const chatState = useChatState(projectId, sessionId);

  // Extract data from hooks
  const {
    data: messagesData,
    isLoading: isLoadingMessages,
  } = messagesQuery;

  const messages = useMemo(() => {
    const msgs = messagesData?.messages || [];
    return msgs;
  }, [messagesData?.messages]);

  const {
    sendMessage,
    isLoading: isSending,
    error: sendError,
    isStreaming,
    expectingWebhookUpdate,
    streamingContentBlocks,
    streamingAssistantMessageId,
    cancelStream,
  } = sendMessageMutation;

  const {
    isError,
    errorMessage,
    errorType,
    isRegenerating,
    handleMutationError,
    saveLastMessage,
    regenerateMessage,
    getErrorMessage,
    clearError,
  } = chatState;

  // Set user data when Clerk user is loaded
  useEffect(() => {
    if (isLoaded && clerkUser) {
      setUser({
        name: clerkUser.fullName || undefined,
        email: clerkUser.emailAddresses[0]?.emailAddress || '',
        imageUrl: clerkUser.imageUrl || undefined,
      });
    } else if (isLoaded && !clerkUser) {
      setUser(null);
    }
  }, [isLoaded, clerkUser]);

  // Handle send errors
  useEffect(() => {
    if (sendError) {
      handleMutationError(sendError);
    }
  }, [sendError, handleMutationError]);

  // Scroll to bottom when messages change or streaming updates
  useEffect(() => {
    const scrollTimeout = setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'end'
        });
      }
    }, 100);

    return () => clearTimeout(scrollTimeout);
  }, [messages, isLoadingMessages, streamingContentBlocks]);

  // Derive a flag instead of early return to keep hook order stable
  const hasSession = Boolean(sessionId);

  // Avoid duplicate assistant responses: hide streaming block once saved message arrives
  const hasSavedStreamedMessage = useMemo(() => {
    return streamingAssistantMessageId
      ? messages.some(m => m.id === streamingAssistantMessageId)
      : false;
  }, [messages, streamingAssistantMessageId]);

  // Keep streaming UI visible while waiting for webhook-saved message
  const showStreamingAssistant = Boolean(
    (isStreaming || expectingWebhookUpdate) && (!streamingAssistantMessageId || !hasSavedStreamedMessage)
  );

  // Handle sending messages
  const handleSendMessage = async (
    content: string,
    options?: { includeContext?: boolean; contextFiles?: string[]; imageFile?: File }
  ) => {
    if (!content.trim() && !options?.imageFile) return;

    // Clear error state
    clearError();

    // Save message for regeneration
    saveLastMessage(content, options);

    // Send the message
    sendMessage({ content, options });
  };

  // Handle regeneration
  const handleRegenerate = async () => {
    await regenerateMessage(async (content, options) => {
      sendMessage({ content, options });
    });
  };

  // Filter and enhance messages for display
  const filteredMessages = messages.filter(message => {
    // If there are user messages, filter out the system welcome message
    const hasUserMessages = messages.some(m => m.role === 'user');
    if (hasUserMessages &&
        message.role === 'system' &&
        message.content?.includes('Project created successfully')) {
      return false;
    }
    return true;
  });

  // Enhance messages with showAvatar property
  const enhancedMessages = filteredMessages.map((message, index) => {
    let showAvatar = true;

    if (index > 0) {
      const prevMessage = filteredMessages[index - 1];
      if (prevMessage.role === message.role) {
        showAvatar = false;
      }
    }

    return {
      ...message,
      showAvatar,
      onRegenerate: message.role === 'assistant' && message.hasError ? handleRegenerate : undefined,
    };
  });

  return (
    <div className={cn('flex flex-col h-full', className)} data-testid="chat-interface">
      <ModelBanner
        currentBranch={currentBranch}
        chatSessionId={activeChatSessionId}
      />

      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {!hasSession ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No session selected</p>
            </div>
          ) : messages.length === 0 && isLoadingMessages ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {enhancedMessages.map(message => (
                <ChatMessage
                  key={message.id}
                  id={message.id}
                  content={message.content || ''}
                  blocks={message.blocks}
                  role={message.role}
                  timestamp={message.timestamp}
                  isLoading={(message as { isLoading?: boolean }).isLoading || false}
                  user={user ? {
                    name: user.name || undefined,
                    email: user.email,
                    imageUrl: user.imageUrl || undefined
                  } : undefined}
                  showAvatar={message.showAvatar}
                  hasError={message.hasError}
                  errorType={message.errorType}
                  onRegenerate={message.onRegenerate}
                  commitSha={message.commitSha}
                  projectId={projectId}
                  sessionId={sessionId}
                  metadata={message.metadata}
                  attachments={message.attachments}
                />
              ))}

              {/* Removed pre-stream immediate loading state */}

                            {/* Real-time streaming assistant response - use same layout as stored messages */}
              {showStreamingAssistant && (
                <div className="animate-in fade-in-0 duration-300">
                  <div className="flex w-full max-w-[95%] mx-auto gap-3 p-4" role="listitem">
                    {/* Avatar column - same as ChatMessage */}
                    <div className="relative flex items-center justify-center h-8 w-8">
                      <div className="bg-muted border-primary rounded-md flex items-center justify-center h-full w-full">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-primary">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                        </svg>
                      </div>
                    </div>

                    {/* Content column - full available width */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4>AI Assistant</h4>
                        <time className="text-xs text-muted-foreground">now</time>
                      </div>

                      {/* Full-width assistant response */}
                      {streamingContentBlocks && streamingContentBlocks.length > 0 ? (
                        <AssistantResponse
                          response={{
                            id: streamingAssistantMessageId!,
                            contentBlocks: streamingContentBlocks,
                            timestamp: new Date(),
                            status: 'streaming',
                          }}
                        />
                      ) : (
                        // Show loading state when streaming but no content blocks yet
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                          </div>
                          <span className="animate-pulse">Processing request...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error states */}
          {isError && errorMessage !== 'LIMIT_REACHED' && (
            <div className="w-full max-w-[95%] mx-auto p-4">
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-3">
                    <div>
                      <h4 className="text-sm font-medium text-destructive mb-1">
                        Something went wrong
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {getErrorMessage(errorType)}
                      </p>
                    </div>
                    <button
                      onClick={handleRegenerate}
                      disabled={isRegenerating}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-md transition-colors disabled:opacity-50"
                    >
                      {isRegenerating ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCcw className="h-3 w-3" />
                          Try Again
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}



          <div ref={messagesEndRef} className="pb-6" />
        </div>
      </ScrollArea>

      <div className="px-4 pb-0 relative">
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isSending || isRegenerating}
          isStreaming={isStreaming}
          onStop={cancelStream}
          placeholder="Type your message..."
          data-testid="chat-input"
          className="chat-input"
        />
      </div>
    </div>
  );
}
