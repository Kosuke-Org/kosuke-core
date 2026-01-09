'use client';

import { Loader2, RefreshCcw } from 'lucide-react';
import Image from 'next/image';
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
  sessionId,
  model,
  isBuildInProgress = false,
  isBuildFailed = false,
  hasPullRequest = false,
}: ChatInterfaceProps) {
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesStartRef = useRef<HTMLDivElement>(null);

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
  const { data: messagesData, isLoading: isLoadingMessages } = messagesQuery;

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

  // Scroll to top when user sends a message
  useEffect(() => {
    if (isSending && messagesStartRef.current) {
      const scrollTimeout = setTimeout(() => {
        messagesStartRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 100);
      return () => clearTimeout(scrollTimeout);
    }
  }, [isSending]);

  // Scroll to bottom when messages load or streaming updates (not on send)
  useEffect(() => {
    if (!isSending) {
      const scrollTimeout = setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
          });
        }
      }, 100);
      return () => clearTimeout(scrollTimeout);
    }
  }, [messages, isLoadingMessages, streamingContentBlocks, isSending]);

  // Derive a flag instead of early return to keep hook order stable
  const hasSession = Boolean(sessionId);

  // Avoid duplicate assistant responses: hide streaming block once saved message has CONTENT
  // (not just when it exists - placeholder messages have null content)
  const hasSavedStreamedMessage = useMemo(() => {
    if (!streamingAssistantMessageId) return false;
    const message = messages.find(m => m.id === streamingAssistantMessageId);
    // Only consider it "saved" if it has actual content or blocks
    return message ? Boolean(message.content || message.blocks?.length) : false;
  }, [messages, streamingAssistantMessageId]);

  // Keep streaming UI visible while waiting for webhook-saved message
  const showStreamingAssistant = Boolean(
    (isStreaming || expectingWebhookUpdate) &&
    (!streamingAssistantMessageId || !hasSavedStreamedMessage)
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
    if (
      hasUserMessages &&
      message.role === 'system' &&
      message.content?.includes('Project created successfully')
    ) {
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

    // Always show avatar for build messages (they should appear as separate messages)
    const hasBuildJobId = message.metadata && 'buildJobId' in message.metadata;
    if (hasBuildJobId) {
      showAvatar = true;
    }

    return {
      ...message,
      showAvatar,
      onRegenerate: message.role === 'assistant' && message.hasError ? handleRegenerate : undefined,
    };
  });

  return (
    <div className={cn('flex flex-col h-full', className)} data-testid="chat-interface">
      <ModelBanner model={model} />

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
              <div ref={messagesStartRef} />
              {enhancedMessages.map(message => (
                <ChatMessage
                  key={message.id}
                  id={message.id}
                  content={message.content || ''}
                  blocks={message.blocks}
                  role={message.role}
                  timestamp={message.timestamp}
                  isLoading={(message as { isLoading?: boolean }).isLoading || false}
                  user={
                    user
                      ? {
                          name: user.name || undefined,
                          email: user.email,
                          imageUrl: user.imageUrl || undefined,
                        }
                      : undefined
                  }
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
                  <div className="w-full max-w-[95%] mx-auto p-4" role="listitem">
                    <div className="space-y-1">
                      {/* Show Kosuke logo only when we have non-thinking content blocks */}
                      {streamingContentBlocks &&
                        streamingContentBlocks.some(block => block.type !== 'thinking') && (
                          <div className="flex">
                            <Image
                              src="/logo.svg"
                              alt="Kosuke"
                              width={20}
                              height={20}
                              className="hidden dark:block"
                            />
                            <Image
                              src="/logo-dark.svg"
                              alt="Kosuke"
                              width={20}
                              height={20}
                              className="block dark:hidden"
                            />
                          </div>
                        )}

                      {/* Full-width assistant response - filter out thinking blocks during streaming */}
                      {streamingContentBlocks &&
                      streamingContentBlocks.some(block => block.type !== 'thinking') ? (
                        <AssistantResponse
                          response={{
                            id: streamingAssistantMessageId!,
                            contentBlocks: streamingContentBlocks.filter(
                              block => block.type !== 'thinking'
                            ),
                            timestamp: new Date(),
                            status: 'streaming',
                          }}
                        />
                      ) : (
                        // Show loading state with logo inline when no non-thinking content blocks yet
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Image
                            src="/logo.svg"
                            alt="Kosuke"
                            width={20}
                            height={20}
                            className="hidden dark:block animate-pulse"
                          />
                          <Image
                            src="/logo-dark.svg"
                            alt="Kosuke"
                            width={20}
                            height={20}
                            className="block dark:hidden animate-pulse"
                          />
                          <span className="animate-pulse">Thinking...</span>
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
                      <p className="text-sm text-muted-foreground">{getErrorMessage(errorType)}</p>
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
          placeholder={
            hasPullRequest
              ? 'Pull request created. Start a new chat to make more changes.'
              : isBuildFailed
                ? 'Build stopped. Use the restart button above to try again.'
                : isBuildInProgress
                  ? 'Build in progress...'
                  : 'Type your message...'
          }
          disabled={isBuildInProgress || isBuildFailed || hasPullRequest}
          data-testid="chat-input"
          className="chat-input"
        />
      </div>
    </div>
  );
}
