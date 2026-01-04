'use client';

import { Loader2, RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useUser } from '@clerk/nextjs';

// Import types and hooks
import { useAgentHealth } from '@/hooks/use-agent-health';
import { useChatSessionMessages } from '@/hooks/use-chat-sessions';
import { useChatState } from '@/hooks/use-chat-state';
import { useRequirementsMessages } from '@/hooks/use-requirements-messages';
import { useSendMessage } from '@/hooks/use-send-message';
import { useSendRequirementsMessage } from '@/hooks/use-send-requirements-message';
import type {
  AssistantBlock,
  Attachment,
  ChatInterfaceProps,
  ChatMessage as ChatMessageType,
  ErrorType,
} from '@/lib/types';

// Import components
import AssistantResponse from './assistant-response';
import ChatInput from './chat-input';
import ChatMessage from './chat-message';

import ModelBanner from './model-banner';

// Messages skeleton for when messages are loading (banner and input already rendered)
function MessagesSkeleton() {
  return (
    <div className="flex flex-col">
      {/* Assistant message skeleton */}
      <div className="flex w-full max-w-[95%] mx-auto gap-3 p-4">
        <Skeleton className="h-8 w-8 rounded-md shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>

      {/* User message skeleton */}
      <div className="flex w-full max-w-[95%] mx-auto gap-3 p-4">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>

      {/* Assistant message skeleton */}
      <div className="flex w-full max-w-[95%] mx-auto gap-3 p-4">
        <Skeleton className="h-8 w-8 rounded-md shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    </div>
  );
}

// Full skeleton for initial page loading - exported for use in project page
export function ChatInterfaceSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Model Banner Skeleton */}
      <div className="px-4">
        <div className="flex items-center justify-between w-full px-4 py-2.5 rounded-md bg-gradient-to-r from-primary/5 to-background">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      </div>

      {/* Messages Area Skeleton */}
      <div className="flex-1 overflow-hidden">
        <MessagesSkeleton />
      </div>

      {/* Chat Input Skeleton */}
      <div className="px-4 pb-0">
        <div className="relative flex flex-col rounded-lg border border-border shadow-lg bg-background">
          <Skeleton className="min-h-[100px] w-full rounded-lg border-0" />
          <div className="flex items-center gap-2 px-3 absolute bottom-3 right-0">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatInterface({
  projectId,
  className,
  activeChatSessionId,
  sessionId,
  model,
  isBuildInProgress = false,
  isBuildFailed = false,
  // Requirements mode props
  mode = 'development',
  projectStatus = 'active',
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

  // Mode-specific hooks - always call hooks at the top level
  // Development mode hooks
  const sendDevMessageMutation = useSendMessage(projectId, activeChatSessionId, sessionId || '');
  const devMessagesQuery = useChatSessionMessages(projectId, sessionId || '');
  const chatState = useChatState(projectId, sessionId);

  // Requirements mode hooks
  const reqMessagesQuery = useRequirementsMessages(projectId);
  const sendReqMessageMutation = useSendRequirementsMessage(projectId);

  // Agent health - used to disable input until agent is ready
  const { data: agentHealth } = useAgentHealth({
    projectId,
    enabled: Boolean(projectId),
    pollingInterval: 10000,
  });

  // Agent is ready when running, alive, and explicitly ready
  const isAgentReady = Boolean(agentHealth?.running && agentHealth?.alive && agentHealth?.ready);

  // Extract streaming state from requirements hook
  const {
    isStreaming: isReqStreaming,
    streamingContentBlocks: reqStreamingContentBlocks,
    streamingAssistantMessageId: reqStreamingAssistantMessageId,
    cancelStream: reqCancelStream,
  } = sendReqMessageMutation;

  // Select hooks based on mode
  const isRequirementsMode = mode === 'requirements';

  // Extract data from queries
  const { data: devMessagesData, isLoading: isLoadingDevMessages } = devMessagesQuery;
  const { data: reqMessagesData, isLoading: isLoadingReqMessages } = reqMessagesQuery;

  // Select the appropriate loading state
  const isLoadingMessages = isRequirementsMode ? isLoadingReqMessages : isLoadingDevMessages;

  // Handle messages differently based on mode
  // Requirements mode returns array directly, development mode returns { messages: [...] }
  const messages = useMemo(() => {
    if (isRequirementsMode) {
      // Requirements mode: data is array of RequirementsMessage - cast to ChatMessage-compatible shape
      return (reqMessagesData || []).map(msg => {
        // For assistant messages without blocks but with content,
        // create a synthetic text block to enable markdown rendering
        let blocks: AssistantBlock[] | undefined = msg.blocks as AssistantBlock[] | undefined;

        if (msg.role === 'assistant' && (!blocks || blocks.length === 0) && msg.content) {
          blocks = [{ type: 'text', content: msg.content }];
        }

        return {
          ...msg,
          role: msg.role as 'user' | 'assistant' | 'system',
          blocks,
          hasError: false,
          errorType: undefined as ErrorType | undefined,
          commitSha: undefined as string | undefined,
          metadata: undefined as ChatMessageType['metadata'],
          attachments: undefined as Attachment[] | undefined,
        };
      });
    }
    // Development mode: data is { messages: [...] }
    return devMessagesData?.messages || [];
  }, [devMessagesData, reqMessagesData, isRequirementsMode]);

  // Extract development mode mutation data
  const {
    sendMessage,
    isLoading: isSending,
    error: sendError,
    isStreaming,
    expectingWebhookUpdate,
    streamingContentBlocks,
    streamingAssistantMessageId,
    cancelStream,
  } = sendDevMessageMutation;

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
          block: 'end',
        });
      }
    }, 100);

    return () => clearTimeout(scrollTimeout);
  }, [messages, isLoadingMessages, streamingContentBlocks, reqStreamingContentBlocks]);

  // Derive a flag instead of early return to keep hook order stable
  // Requirements mode doesn't need a session, development mode does
  const hasSession = isRequirementsMode || Boolean(sessionId);

  // Check if chat input should be disabled for requirements mode
  const isRequirementsReadonly = isRequirementsMode && projectStatus !== 'requirements';

  // Select the appropriate streaming state based on mode
  const activeIsStreaming = isRequirementsMode ? isReqStreaming : isStreaming;
  const activeStreamingContentBlocks = isRequirementsMode
    ? reqStreamingContentBlocks
    : streamingContentBlocks;
  const activeStreamingAssistantMessageId = isRequirementsMode
    ? reqStreamingAssistantMessageId
    : streamingAssistantMessageId;
  const activeCancelStream = isRequirementsMode ? reqCancelStream : cancelStream;

  // Avoid duplicate assistant responses: hide streaming block once saved message arrives
  const hasSavedStreamedMessage = useMemo(() => {
    return activeStreamingAssistantMessageId
      ? messages.some(m => m.id === activeStreamingAssistantMessageId)
      : false;
  }, [messages, activeStreamingAssistantMessageId]);

  // Keep streaming UI visible while waiting for webhook-saved message
  const showStreamingAssistant = Boolean(
    (activeIsStreaming || (!isRequirementsMode && expectingWebhookUpdate)) &&
    (!activeStreamingAssistantMessageId || !hasSavedStreamedMessage)
  );

  // Handle sending messages
  const handleSendMessage = async (
    content: string,
    options?: { includeContext?: boolean; contextFiles?: string[]; imageFile?: File }
  ) => {
    if (!content.trim() && !options?.imageFile) return;

    if (isRequirementsMode) {
      // Requirements mode: just send content
      sendReqMessageMutation.mutate(content);
    } else {
      // Development mode: use full sendMessage with options
      // Clear error state
      clearError();

      // Save message for regeneration
      saveLastMessage(content, options);

      // Send the message
      sendMessage({ content, options });
    }
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
      <ModelBanner
        model={model}
        projectId={projectId}
        showAgentStatus={isRequirementsMode}
        agentHealth={agentHealth}
      />

      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="flex flex-col">
          {!hasSession ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No session selected</p>
            </div>
          ) : messages.length === 0 && isLoadingMessages ? (
            <MessagesSkeleton />
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
                  <div className="flex w-full max-w-[95%] mx-auto gap-3 p-4" role="listitem">
                    {/* Avatar column - same as ChatMessage */}
                    <div className="relative flex items-center justify-center h-8 w-8">
                      <div className="bg-muted border-primary rounded-md flex items-center justify-center h-full w-full">
                        <svg
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="h-6 w-6 text-primary"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                          />
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
                      {activeStreamingContentBlocks && activeStreamingContentBlocks.length > 0 ? (
                        <AssistantResponse
                          response={{
                            id: activeStreamingAssistantMessageId!,
                            contentBlocks: activeStreamingContentBlocks,
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
          isLoading={isSending || isRegenerating || sendReqMessageMutation.isPending}
          isStreaming={activeIsStreaming}
          onStop={activeCancelStream}
          placeholder={
            !isAgentReady
              ? 'Waiting for agent...'
              : isRequirementsReadonly
                ? 'Requirements have been submitted'
                : isRequirementsMode
                  ? 'Describe your project requirements...'
                  : isBuildFailed
                    ? 'Build stopped. Use the restart button above to try again.'
                    : isBuildInProgress
                      ? 'Build in progress...'
                      : 'Type your message...'
          }
          disabled={!isAgentReady || isBuildInProgress || isBuildFailed || isRequirementsReadonly}
          data-testid="chat-input"
          className="chat-input"
        />
      </div>
    </div>
  );
}
