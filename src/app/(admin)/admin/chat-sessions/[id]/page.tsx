'use client';

import { formatDistanceToNow } from 'date-fns';
import { Bot, GitBranch, Loader2, UserCog } from 'lucide-react';
import { use, useEffect, useRef, useState } from 'react';

import { useAdminChatSession } from '@/hooks/use-admin-chat-session';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

import ChatInput from '@/app/(project-workspace)/projects/[id]/components/chat/chat-input';
import ChatMessage from '@/app/(project-workspace)/projects/[id]/components/chat/chat-message';

export default function AdminChatSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<'autonomous' | 'human_assisted' | null>(null);

  // Use the admin chat session hook
  const {
    session,
    isLoadingSession,
    messages,
    isLoadingMessages,
    sendMessage,
    isSendingMessage,
    toggleMode,
    isTogglingMode,
  } = useAdminChatSession({ sessionId });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (
    content: string,
    options?: { includeContext?: boolean; attachments?: File[] }
  ) => {
    if (!content.trim() && !options?.attachments?.length) return;
    sendMessage(content.trim(), options?.attachments);
  };

  const handleModeToggle = () => {
    const newMode = session?.mode === 'autonomous' ? 'human_assisted' : 'autonomous';
    setPendingMode(newMode);
    setModeDialogOpen(true);
  };

  const confirmModeChange = () => {
    if (pendingMode) {
      toggleMode(pendingMode);
      setModeDialogOpen(false);
      setPendingMode(null);
    }
  };

  const cancelModeChange = () => {
    setModeDialogOpen(false);
    setPendingMode(null);
  };

  // Show skeleton while loading or if session is not yet available
  if (isLoadingSession || session === undefined) {
    return <PageSkeleton />;
  }

  // Only show "not found" if we're done loading and session is definitely not available
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <p className="text-muted-foreground">Session not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{session.title}</h1>
          <p className="text-muted-foreground">
            {session.projectName || 'Unknown Project'} &bull; {session.messageCount || 0} messages
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {session.mode === 'autonomous' ? 'AI Mode' : 'Human Mode'}
          </span>
          <Switch
            checked={session.mode === 'human_assisted'}
            onCheckedChange={handleModeToggle}
            disabled={isTogglingMode}
          />
          <Badge
            variant={session.mode === 'human_assisted' ? 'default' : 'secondary'}
            className={
              session.mode === 'human_assisted'
                ? 'bg-green-600 hover:bg-green-600 dark:bg-green-800 dark:hover:bg-green-800 text-white dark:text-green-100'
                : ''
            }
          >
            {session.mode === 'human_assisted' ? (
              <>
                <UserCog className="mr-1 h-3 w-3" />
                Human Assisted
              </>
            ) : (
              <>
                <Bot className="mr-1 h-3 w-3" />
                Autonomous
              </>
            )}
          </Badge>
        </div>
      </div>

      {/* Main Content - Side by Side Layout (1/3 details, 2/3 chat) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        {/* Left Panel - Session Details */}
        <Card className="h-fit">
          <CardContent className="px-4 pb-4 pt-0">
            <div className="space-y-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  Status
                </span>
                <div className="mt-1">
                  <Badge variant={session.status === 'active' ? 'default' : 'secondary'}>
                    {session.status || 'Unknown'}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  Branch
                </span>
                <div className="mt-1 flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  <code className="text-xs break-all">{session.branchName}</code>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  User ID
                </span>
                <div className="mt-1">
                  <code className="text-xs break-all">{session.userId || 'N/A'}</code>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  Last Activity
                </span>
                <div className="mt-1 text-sm">
                  {formatDistanceToNow(new Date(session.lastActivityAt), { addSuffix: true })}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  Created
                </span>
                <div className="mt-1 text-sm">
                  {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                </div>
              </div>
              {session.description && (
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">
                    Description
                  </span>
                  <div className="mt-1 text-sm">{session.description}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right Panel - Chat Messages */}
        <div className="flex flex-col">
          {/* Messages Header - lean */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">Messages</h2>
            {isLoadingMessages && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Messages Area */}
          <ScrollArea className="flex-1">
            <div className="flex flex-col">
              {messages.length === 0 && !isLoadingMessages ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  No messages yet
                </div>
              ) : isLoadingMessages && messages.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {messages.map(message => (
                    <ChatMessage
                      key={message.id}
                      id={message.id}
                      content={message.content || ''}
                      blocks={message.blocks || undefined}
                      role={message.role}
                      timestamp={new Date(message.timestamp)}
                      showAvatar={true}
                      commitSha={message.commitSha || undefined}
                      metadata={message.metadata || undefined}
                      adminUserId={message.adminUserId || undefined}
                    />
                  ))}
                  <div ref={messagesEndRef} className="pb-6" />
                </>
              )}
            </div>
          </ScrollArea>

          {/* Message Input */}
          <div className="mt-4">
            <ChatInput
              onSendMessage={handleSendMessage}
              isLoading={isSendingMessage}
              placeholder="Type a message as admin..."
              disabled={isSendingMessage}
            />
            <p className="text-xs text-muted-foreground mt-2 px-4">
              Sending a message will automatically switch the session to human-assisted mode.
            </p>
          </div>
        </div>
      </div>

      {/* Mode Change Confirmation Dialog */}
      <AlertDialog open={modeDialogOpen} onOpenChange={setModeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMode === 'human_assisted'
                ? 'Switch to Human-Assisted Mode?'
                : 'Switch to Autonomous Mode?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMode === 'human_assisted'
                ? 'The user will be notified that a support agent has joined. AI responses will be paused until you switch back to autonomous mode.'
                : 'The user will be notified that AI responses are now active. The conversation will be handed back to the AI assistant.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelModeChange} disabled={isTogglingMode}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmModeChange} disabled={isTogglingMode}>
              {isTogglingMode ? 'Updating...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        <Skeleton className="h-64" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    </div>
  );
}
