'use client';

import type { BuildStatus, TicketData } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { useEffect } from 'react';

interface BuildMessageProps {
  buildJobId: string;
  projectId: string;
  sessionId: string;
  timestamp: Date;
  className?: string;
  onActiveChange?: (isActive: boolean) => void;
}

interface BuildJobResponse {
  build: {
    id: string;
    status: BuildStatus;
    totalTickets: number;
    completedTickets: number;
    failedTickets: number;
    currentTicketId: string | null;
    totalCost: number | null;
    errorMessage: string | null;
    tickets: TicketData[] | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
}

/**
 * BuildMessage - Renders a build job as a chat message
 * Shows progress while running, summary when complete
 */
export default function BuildMessage({
  buildJobId,
  projectId,
  sessionId,
  timestamp,
  className,
  onActiveChange,
}: BuildMessageProps) {
  // Fetch build status with polling while active
  const { data, isLoading } = useQuery({
    queryKey: ['build-job', buildJobId],
    queryFn: async (): Promise<BuildJobResponse> => {
      const response = await fetch(
        `/api/projects/${projectId}/chat-sessions/${sessionId}/build-status/${buildJobId}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch build status');
      }
      return response.json();
    },
    // Poll every 5 seconds while build is active
    refetchInterval: query => {
      const build = query.state.data?.build;
      if (!build) return false;
      if (build.status === 'completed' || build.status === 'failed') return false;
      return 5000;
    },
    staleTime: 1000,
  });

  const build = data?.build;
  const isActive = build?.status === 'pending' || build?.status === 'running';
  const isCompleted = build?.status === 'completed';
  const isFailed = build?.status === 'failed';

  // Notify parent of active state changes
  useEffect(() => {
    onActiveChange?.(isActive ?? false);
  }, [isActive, onActiveChange]);

  // Loading state
  if (isLoading || !build) {
    return (
      <div className={cn('flex w-full max-w-[95%] mx-auto gap-3 p-4', className)}>
        <div className="h-8 w-8 shrink-0" />
        <div className="flex-1">
          <div className="text-sm text-muted-foreground">Loading build status...</div>
        </div>
      </div>
    );
  }

  const progress = build.totalTickets > 0
    ? Math.round(((build.completedTickets + build.failedTickets) / build.totalTickets) * 100)
    : 0;

  // Get ticket status icon
  const getTicketIcon = (ticket: TicketData) => {
    if (ticket.status === 'Done') {
      return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
    }
    if (ticket.status === 'Error') {
      return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    }
    if (ticket.status === 'InProgress') {
      // Pulsing blue circle for running
      return (
        <div className="h-4 w-4 shrink-0 relative">
          <Circle className="h-4 w-4 text-blue-500 absolute" />
          <Circle className="h-4 w-4 text-blue-500 absolute animate-ping opacity-50" />
        </div>
      );
    }
    // Todo - empty circle
    return <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />;
  };

  return (
    <div className={cn('flex w-full max-w-[95%] mx-auto gap-3 p-4', className)} role="listitem">
      {/* Avatar placeholder for alignment */}
      <div className="h-8 w-8 shrink-0 rounded-md bg-muted flex items-center justify-center">
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : isFailed ? (
          <XCircle className="h-5 w-5 text-red-500" />
        ) : (
          <span className="text-lg">🔨</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">
            {isActive && 'Building...'}
            {isCompleted && 'Build Complete'}
            {isFailed && 'Build Failed'}
          </h4>
          <div className="flex items-center gap-2">
            {build.totalCost !== null && build.totalCost > 0 && (
              <span className="text-xs text-muted-foreground">
                ${build.totalCost.toFixed(2)}
              </span>
            )}
            <time className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
            </time>
          </div>
        </div>

        {/* Progress bar - only while active */}
        {isActive && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {build.completedTickets + build.failedTickets} / {build.totalTickets} tickets
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Ticket list */}
        {build.tickets && build.tickets.length > 0 && (
          <div className="space-y-1.5">
            {build.tickets.map(ticket => (
              <div
                key={ticket.id}
                className="flex items-center gap-2 text-sm"
              >
                {getTicketIcon(ticket)}
                <span
                  className={cn(
                    'truncate',
                    ticket.status === 'Done' && 'text-muted-foreground line-through',
                    ticket.status === 'Error' && 'text-red-500',
                    ticket.status === 'InProgress' && 'text-blue-500 font-medium'
                  )}
                >
                  {ticket.id}: {ticket.title}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {build.errorMessage && (
          <div className="text-sm text-red-500 bg-red-500/10 rounded-md p-2">
            {build.errorMessage}
          </div>
        )}

        {/* Summary for completed builds */}
        {!isActive && (
          <div className="text-sm text-muted-foreground">
            {build.completedTickets} completed
            {build.failedTickets > 0 && `, ${build.failedTickets} failed`}
          </div>
        )}
      </div>
    </div>
  );
}
