'use client';

import { CheckCircle2, Loader2, RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useUser } from '@clerk/nextjs';

// Import types and hooks
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
  onConfirmRequirements,
  canConfirm = false,
  isConfirming = false,
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

  // Confirmation modal state for requirements mode
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Mode-specific hooks - always call hooks at the top level
  // Development mode hooks
  const sendDevMessageMutation = useSendMessage(projectId, activeChatSessionId, sessionId || '');
  const devMessagesQuery = useChatSessionMessages(projectId, sessionId || '');
  const chatState = useChatState(projectId, sessionId);

  // Requirements mode hooks
  const reqMessagesQuery = useRequirementsMessages(projectId);
  const sendReqMessageMutation = useSendRequirementsMessage(projectId);

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
      return (reqMessagesData || []).map(msg => ({
        ...msg,
        role: msg.role as 'user' | 'assistant' | 'system',
        blocks: msg.blocks as AssistantBlock[] | undefined,
        hasError: false,
        errorType: undefined as ErrorType | undefined,
        commitSha: undefined as string | undefined,
        metadata: undefined as ChatMessageType['metadata'],
        attachments: undefined as Attachment[] | undefined,
      }));
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
  }, [messages, isLoadingMessages, streamingContentBlocks]);

  // Derive a flag instead of early return to keep hook order stable
  // Requirements mode doesn't need a session, development mode does
  const hasSession = isRequirementsMode || Boolean(sessionId);

  // Check if chat input should be disabled for requirements mode
  const isRequirementsReadonly = isRequirementsMode && projectStatus !== 'requirements';

  // Avoid duplicate assistant responses: hide streaming block once saved message arrives
  const hasSavedStreamedMessage = useMemo(() => {
    return streamingAssistantMessageId
      ? messages.some(m => m.id === streamingAssistantMessageId)
      : false;
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
        projectId={isRequirementsMode ? projectId : undefined}
        showAgentStatus={isRequirementsMode}
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
        {/* Confirm Requirements Button - only show in requirements mode when status is 'requirements' */}
        {isRequirementsMode && projectStatus === 'requirements' && onConfirmRequirements && (
          <div className="mb-3 flex justify-end">
            <Button
              onClick={() => setShowConfirmModal(true)}
              disabled={!canConfirm || messages.length === 0}
              size="sm"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirm Requirements
            </Button>
          </div>
        )}

        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isSending || isRegenerating || sendReqMessageMutation.isPending}
          isStreaming={isStreaming}
          onStop={cancelStream}
          placeholder={
            isRequirementsReadonly
              ? 'Requirements have been submitted'
              : isRequirementsMode
                ? 'Describe your project requirements...'
                : isBuildFailed
                  ? 'Build stopped. Use the restart button above to try again.'
                  : isBuildInProgress
                    ? 'Build in progress...'
                    : 'Type your message...'
          }
          disabled={isBuildInProgress || isBuildFailed || isRequirementsReadonly}
          data-testid="chat-input"
          className="chat-input"
        />
      </div>

      {/* Confirm Requirements Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Requirements</DialogTitle>
            <DialogDescription>
              Are you sure you want to confirm your project requirements? This will send them for
              review and you will be notified when development begins.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onConfirmRequirements?.();
                setShowConfirmModal(false);
              }}
              disabled={isConfirming}
            >
              {isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Requirements
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
