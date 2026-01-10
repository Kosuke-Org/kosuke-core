'use client';

import { formatDistanceToNow } from 'date-fns';
import { Copy, RefreshCcw, ShieldCheck } from 'lucide-react';
import Image from 'next/image';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { cn } from '@/lib/utils';

// Import types and utilities
import type { AssistantBlock, ChatMessageProps, ContentBlock, ErrorType } from '@/lib/types';
import { getFileName, processMessageContent } from '@/lib/utils/message-content';
import AssistantResponse from './assistant-response';
import { copyToClipboard, extractMessageContent } from './copy-message-content';
import { BuildMessage } from './build-message';
import ChatMessageAttachments from './chat-message-attachments';
import { MessageRevertButton } from './message-revert-button';

export default function ChatMessage({
  id,
  content,
  blocks,
  role,
  timestamp,
  isLoading = false,
  className,
  showAvatar = true,
  hasError = false,
  errorType = 'unknown',
  onRegenerate,
  commitSha,
  projectId,
  sessionId,
  metadata,
  attachments,
  adminUserId: _adminUserId,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const isAdmin = role === 'admin';
  const isRevertMessage = isSystem && metadata?.revertInfo;
  const { imageUrl, displayName, initials } = useUser();
  const { toast } = useToast();

  // Handle copy message content
  const handleCopyMessage = async () => {
    const textContent = extractMessageContent(content, blocks, role);
    const success = await copyToClipboard(textContent);

    if (success) {
      toast({
        description: 'Message copied to clipboard',
      });
    } else {
      toast({
        description: 'Failed to copy message',
        variant: 'destructive',
      });
    }
  };

  // Get appropriate error message based on error type
  const getErrorMessage = (type: ErrorType): string => {
    switch (type) {
      case 'timeout':
        return 'The response timed out';
      case 'parsing':
        return 'Error processing AI response';
      case 'processing':
        return 'Error processing your request';
      case 'unknown':
      default:
        return 'An error occurred';
    }
  };

  // Convert AssistantBlock[] to ContentBlock[] for display
  const convertBlocksToContentBlocks = (assistantBlocks: AssistantBlock[]): ContentBlock[] => {
    return assistantBlocks.map((block, index) => {
      const baseBlock = {
        id: `block-${Date.now()}-${index}`,
        index,
        status: 'completed' as const,
        timestamp: new Date(),
      };

      if (block.type === 'text') {
        return {
          ...baseBlock,
          type: 'text' as const,
          content: block.content,
        };
      } else if (block.type === 'thinking') {
        return {
          ...baseBlock,
          type: 'thinking' as const,
          content: block.content,
          isCollapsed: true, // Auto-collapse thinking blocks in chat history
        };
      } else if (block.type === 'tool') {
        return {
          ...baseBlock,
          type: 'tool' as const,
          content: `Executed ${block.name}`,
          toolName: block.name,
          toolResult: block.result || 'Tool completed successfully',
          toolInput: block.input, // Pass the tool input data
        };
      }

      // Fallback for unknown block types
      return {
        ...baseBlock,
        type: 'text' as const,
        content: 'content' in block ? (block as { content: string }).content : 'Unknown block type',
      };
    });
  };

  // Process content using utility function
  const contentParts = processMessageContent(content || '');

  // Check if this is an assistant message with blocks
  const hasBlocks = !isUser && !isSystem && blocks && blocks.length > 0;
  const contentBlocks = hasBlocks ? convertBlocksToContentBlocks(blocks) : null;

  // Handle revert system messages with special styling
  if (isRevertMessage) {
    const handleSystemMessageClick = () => {
      if (metadata?.revertInfo?.messageId) {
        // Find and scroll to the original message
        const targetMessage = document.querySelector(
          `[data-message-id="${metadata.revertInfo.messageId}"]`
        );
        if (targetMessage) {
          targetMessage.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          // Add a brief highlight effect
          targetMessage.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
          setTimeout(() => {
            targetMessage.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
          }, 2000);
        }
      }
    };

    return (
      <div className={cn('flex justify-center mx-auto mb-4', className)}>
        <div
          className={cn(
            'flex items-start gap-3 p-3 max-w-sm min-w-0',
            'bg-card border border-border rounded-lg shadow-sm',
            'cursor-pointer hover:shadow-md transition-all duration-200',
            'hover:border-border/80'
          )}
          role="listitem"
          onClick={handleSystemMessageClick}
        >
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">System</span>
                {metadata?.revertInfo && (
                  <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono text-foreground">
                    {metadata.revertInfo.commitSha?.slice(0, 7)}
                  </code>
                )}
              </div>
              <time className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
              </time>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">{content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Regular layout for user messages and simple assistant messages
  return (
    <div
      className={cn(
        'group/message relative w-full max-w-[95%] mx-auto p-4',
        isAdmin &&
          'bg-green-50/50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-lg',
        !showAvatar && 'pt-1', // Reduce top padding for consecutive messages
        isLoading && 'opacity-50',
        hasError && !isUser && 'border-l-2 border-l-destructive/40', // Red left border for error messages
        isUser && 'flex justify-end', // Align user messages to the right
        className
      )}
      role="listitem"
      data-message-id={id}
    >
      <div className={cn('group space-y-1', isUser && 'max-w-[85%]')}>
        {showAvatar &&
          // Hide avatar for thinking messages (they show logo inline)
          (isUser || hasBlocks || content || Boolean(metadata?.buildJobId)) && (
            <div className={cn('flex items-center gap-2', isUser && 'justify-end')}>
              {!isUser && !isAdmin && (
                <>
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
                </>
              )}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <Badge
                    variant="outline"
                    className="text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                  >
                    Human Support
                  </Badge>
                </div>
              )}
              {isUser && (
                <Avatar className="h-6 w-6">
                  {imageUrl && <AvatarImage src={imageUrl} alt="You" />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          )}

        {/* Render assistant response content blocks if available */}
        {hasBlocks && contentBlocks ? (
          <AssistantResponse
            response={{
              id: id || `temp-${Date.now()}`,
              contentBlocks,
              timestamp: new Date(timestamp),
              status: isLoading ? 'streaming' : 'completed',
            }}
          />
        ) : null}

        {/* Show thinking indicator for assistant messages with null/empty content */}
        {!isUser && !isSystem && !hasBlocks && !content && !metadata?.buildJobId && (
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

        {/* Render build message if metadata contains buildJobId */}
        {metadata?.buildJobId && projectId && sessionId ? (
          <BuildMessage
            buildJobId={String(metadata.buildJobId)}
            projectId={projectId}
            sessionId={sessionId}
          />
        ) : null}

        {/* Render regular text/image content if no blocks */}
        {!hasBlocks && (
          <div
            className={cn(
              'prose prose-xs dark:prose-invert max-w-none text-sm wrap-anywhere',
              !showAvatar && 'mt-0', // Remove top margin for consecutive messages
              hasError && !isUser && 'text-muted-foreground', // Muted text for error messages
              isUser && 'bg-muted/50 rounded-lg px-3 py-2 text-right' // Bubble style for user messages
            )}
          >
            {contentParts.map((part, i) =>
              part.type === 'text' ? (
                // Render regular text content with line breaks
                part.content.split('\n').map((line, j) => (
                  <p
                    key={`${i}-${j}`}
                    className={line.trim() === '' ? 'h-4' : '[word-break:normal] wrap-anywhere'}
                  >
                    {line}
                  </p>
                ))
              ) : part.type === 'thinking' ? (
                // Render thinking content with different styling
                <div key={i} className="my-3 relative">
                  <div className="border-l-2 border-muted-foreground/30 pl-4 py-2 bg-muted/20 rounded-r-md">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 bg-muted-foreground/50 rounded-full animate-pulse"></div>
                      <span className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wide">
                        Thinking
                      </span>
                    </div>
                    <div className="text-muted-foreground/70 text-xs leading-relaxed italic">
                      {part.content.split('\n').map((line, j) => (
                        <p
                          key={`thinking-${i}-${j}`}
                          className={
                            line.trim() === '' ? 'h-3' : '[word-break:normal] wrap-anywhere'
                          }
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                // Render image
                <div key={i} className="my-2 inline-block max-w-[400px]">
                  <div className="flex items-center gap-3 bg-card rounded-md p-2 px-3 border border-border">
                    <div className="relative w-12 h-12 rounded-sm bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      <div
                        className="relative w-full h-full cursor-pointer"
                        onClick={() => window.open(part.content, '_blank')}
                      >
                        <Image
                          src={part.content}
                          alt="Attached Image"
                          fill
                          className="object-cover"
                          sizes="(max-width: 48px) 100vw, 48px"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col justify-center">
                      <p className="text-card-foreground text-sm font-medium truncate max-w-[200px]">
                        {getFileName(part.content)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {part.fileSize ? `${(part.fileSize / 1024).toFixed(1)}kB` : 'Unknown size'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Display attachments if present */}
            {attachments && attachments.length > 0 && (
              <ChatMessageAttachments attachments={attachments} />
            )}
          </div>
        )}

        {/* Display error message if there's an error */}
        {!isUser && hasError && (
          <div className="mt-3 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-sm">
            <div className="flex items-center gap-2 text-destructive">
              <span>{getErrorMessage(errorType)}</span>
            </div>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="mt-2 px-2 py-1 text-xs bg-primary hover:bg-primary/80 text-primary-foreground rounded-md transition-colors flex items-center gap-1 w-fit"
              >
                <RefreshCcw className="h-3 w-3" /> Regenerate response
              </button>
            )}
          </div>
        )}

        {/* Name, timestamp and actions - shown on hover (not for build messages) */}
        {!metadata?.buildJobId && (
          <div
            className={cn(
              'flex items-center gap-1.5 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pt-1',
              isUser && 'justify-end'
            )}
          >
            {isUser ? (
              <>
                <span className="font-medium">{displayName || 'You'}</span>
                <span>·</span>
                <time>{formatDistanceToNow(new Date(timestamp), { addSuffix: true })}</time>
              </>
            ) : (
              <>
                <span className="font-medium">Kosuke</span>
                <span>·</span>
                <time>{formatDistanceToNow(new Date(timestamp), { addSuffix: true })}</time>
                {/* Revert button for assistant messages with commit SHA */}
                {id && projectId && sessionId && commitSha && (
                  <MessageRevertButton
                    message={{ id, role, timestamp, commitSha, content }}
                    projectId={projectId}
                    sessionId={sessionId}
                  />
                )}
              </>
            )}
            {/* Copy message button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 ml-1"
                  onClick={handleCopyMessage}
                >
                  <Copy className="h-3 w-3" />
                  <span className="sr-only">Copy message</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Copy message</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}
