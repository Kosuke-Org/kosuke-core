'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Bot, GitBranch, Loader2, Send, UserCog } from 'lucide-react';
import { use, useEffect, useRef, useState } from 'react';

import { useToast } from '@/hooks/use-toast';

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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

import ChatMessage from '@/app/(project-workspace)/projects/[id]/components/chat/chat-message';
import type { AdminSessionDetail, AdminSessionMessagesResponse } from '@/lib/types';

export default function AdminChatSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messageInput, setMessageInput] = useState('');
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<'autonomous' | 'human_assisted' | null>(null);

  // Fetch session details
  const { data: sessionData, isLoading: isLoadingSession } = useQuery<{
    session: AdminSessionDetail;
  }>({
    queryKey: ['admin-chat-session', sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/chat-sessions/${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch session');
      const result = await response.json();
      return result.data;
    },
  });

  // Fetch messages
  const { data: messagesData, isLoading: isLoadingMessages } =
    useQuery<AdminSessionMessagesResponse>({
      queryKey: ['admin-chat-session-messages', sessionId],
      queryFn: async () => {
        const response = await fetch(`/api/admin/chat-sessions/${sessionId}/messages`);
        if (!response.ok) throw new Error('Failed to fetch messages');
        const result = await response.json();
        return result.data;
      },
      refetchInterval: 5000, // Poll every 5 seconds for new messages
    });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`/api/admin/chat-sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) throw new Error('Failed to send message');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-chat-session-messages', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['admin-chat-session', sessionId] });
      setMessageInput('');
      inputRef.current?.focus();
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive',
      });
    },
  });

  // Toggle mode mutation
  const toggleModeMutation = useMutation({
    mutationFn: async (mode: 'autonomous' | 'human_assisted') => {
      const response = await fetch(`/api/admin/chat-sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) throw new Error('Failed to update mode');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-chat-session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['admin-chat-session-messages', sessionId] });
      toast({
        title: 'Mode updated',
        description:
          pendingMode === 'human_assisted'
            ? 'Session is now in human-assisted mode'
            : 'Session is now in autonomous mode',
      });
      setModeDialogOpen(false);
      setPendingMode(null);
    },
    onError: error => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update mode',
        variant: 'destructive',
      });
      setModeDialogOpen(false);
      setPendingMode(null);
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesData?.messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(messageInput.trim());
  };

  const handleModeToggle = () => {
    const newMode = sessionData?.session.mode === 'autonomous' ? 'human_assisted' : 'autonomous';
    setPendingMode(newMode);
    setModeDialogOpen(true);
  };

  const confirmModeChange = () => {
    if (pendingMode) {
      toggleModeMutation.mutate(pendingMode);
    }
  };

  if (isLoadingSession) {
    return <PageSkeleton />;
  }

  const session = sessionData?.session;
  const messages = messagesData?.messages || [];

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <p className="text-muted-foreground">Session not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{session.title}</h1>
          <p className="text-muted-foreground text-sm">
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
            disabled={toggleModeMutation.isPending}
          />
          <Badge
            variant={session.mode === 'human_assisted' ? 'default' : 'secondary'}
            className={session.mode === 'human_assisted' ? 'bg-green-600 hover:bg-green-600' : ''}
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
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 h-[calc(100%-60px)]">
        {/* Left Panel - Session Details */}
        <Card className="h-fit">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm font-medium">Session Details</CardTitle>
          </CardHeader>
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
        <Card className="flex flex-col min-h-0 h-full">
          <CardHeader className="px-4 py-3 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Messages</CardTitle>
              {isLoadingMessages && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0 min-h-0">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No messages yet
              </div>
            ) : (
              <div className="py-2">
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
                <div ref={messagesEndRef} />
              </div>
            )}
          </CardContent>

          {/* Message Input */}
          <div className="border-t px-4 py-3 flex-shrink-0">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Input
                ref={inputRef}
                value={messageInput}
                onChange={e => setMessageInput(e.target.value)}
                placeholder="Type a message as admin..."
                disabled={sendMessageMutation.isPending}
                className="flex-1"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!messageInput.trim() || sendMessageMutation.isPending}
              >
                {sendMessageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-2">
              Sending a message will automatically switch the session to human-assisted mode.
            </p>
          </div>
        </Card>
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
            <AlertDialogCancel disabled={toggleModeMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmModeChange} disabled={toggleModeMutation.isPending}>
              {toggleModeMutation.isPending ? 'Updating...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4 h-[calc(100vh-100px)]">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 h-[calc(100%-60px)]">
        <Skeleton className="h-64" />
        <Skeleton className="h-full" />
      </div>
    </div>
  );
}
