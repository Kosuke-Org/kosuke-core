'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

import type { AdminChatSession } from '../components/chat-sessions-columns';

interface ChatSessionsResponse {
  chatSessions: AdminChatSession[];
  total: number;
}

export default function AdminChatSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // Fetch single chat session
  const { data, isLoading } = useQuery<ChatSessionsResponse>({
    queryKey: ['admin-chat-session', id],
    queryFn: async () => {
      const response = await fetch(`/api/admin/chat-sessions`);
      if (!response.ok) throw new Error('Failed to fetch chat session');
      const result = await response.json();
      return result.data;
    },
  });

  const chatSession = data?.chatSessions.find(s => s.id === id);

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'archived':
        return <Badge variant="secondary">Archived</Badge>;
      case 'completed':
        return <Badge variant="outline">Completed</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!chatSession) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/chat-sessions">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Chat Sessions
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">Chat session not found</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Back button */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/chat-sessions">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Chat Sessions
          </Link>
        </Button>
      </div>

      {/* Chat Session Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-3xl">{chatSession.title}</CardTitle>
              {chatSession.description && (
                <CardDescription className="text-base">{chatSession.description}</CardDescription>
              )}
            </div>
            {getStatusBadge(chatSession.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Separator />

          {/* Chat Session Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Session ID</h4>
                <p className="text-sm font-mono">{chatSession.id}</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                  Internal Session ID
                </h4>
                <p className="text-sm font-mono">{chatSession.sessionId}</p>
              </div>

              {chatSession.remoteId && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Remote ID</h4>
                  <p className="text-sm font-mono">{chatSession.remoteId}</p>
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Project</h4>
                <p className="text-sm">
                  {chatSession.projectName || (
                    <span className="text-muted-foreground">Unknown</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  {chatSession.projectId}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">User ID</h4>
                <p className="text-sm font-mono">{chatSession.userId || 'N/A'}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Message Count</h4>
                <p className="text-sm">{chatSession.messageCount || 0} messages</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Created At</h4>
                <p className="text-sm">
                  {new Date(chatSession.createdAt).toLocaleString()}
                  <span className="text-muted-foreground ml-2">
                    ({formatDistanceToNow(new Date(chatSession.createdAt), { addSuffix: true })})
                  </span>
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Last Updated</h4>
                <p className="text-sm">
                  {new Date(chatSession.updatedAt).toLocaleString()}
                  <span className="text-muted-foreground ml-2">
                    ({formatDistanceToNow(new Date(chatSession.updatedAt), { addSuffix: true })})
                  </span>
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Last Activity</h4>
                <p className="text-sm">
                  {new Date(chatSession.lastActivityAt).toLocaleString()}
                  <span className="text-muted-foreground ml-2">
                    (
                    {formatDistanceToNow(new Date(chatSession.lastActivityAt), {
                      addSuffix: true,
                    })}
                    )
                  </span>
                </p>
              </div>

              {chatSession.isDefault && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Default Session
                  </h4>
                  <Badge variant="secondary">Yes</Badge>
                </div>
              )}
            </div>
          </div>

          {/* GitHub Integration Info */}
          {(chatSession.branchMergedAt || chatSession.pullRequestNumber) && (
            <>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold mb-4">GitHub Integration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {chatSession.pullRequestNumber && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">
                        Pull Request
                      </h4>
                      <p className="text-sm">#{chatSession.pullRequestNumber}</p>
                    </div>
                  )}
                  {chatSession.branchMergedAt && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">
                        Branch Merged At
                      </h4>
                      <p className="text-sm">
                        {new Date(chatSession.branchMergedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Additional Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Manage this chat session</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-start" asChild>
            <Link href={`/projects/${chatSession.projectId}`} target="_blank">
              View Project
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-32" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
