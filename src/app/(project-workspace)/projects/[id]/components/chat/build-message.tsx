'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { BuildJobResponse, BuildTask } from '@/lib/types/chat';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Circle, CircleCheck, CircleX, Loader2 } from 'lucide-react';

interface BuildMessageProps {
  buildJobId: string;
  projectId: string;
  sessionId: string;
  className?: string;
}

/**
 * BuildMessage - Renders a build job as a chat message
 * Shows progress while running, summary when complete
 */
export function BuildMessage({ buildJobId, projectId, sessionId, className }: BuildMessageProps) {
  // Fetch build status with polling while active
  const { data, isLoading, error } = useQuery({
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
      const buildJob = query.state.data?.buildJob;
      // Stop polling only when we have data AND build is done
      if (buildJob?.status === 'completed' || buildJob?.status === 'failed') {
        return false;
      }
      // Keep polling: no data yet, error recovery, or build in progress
      return 5000;
    },
    staleTime: 1000,
  });

  const buildJob = data?.buildJob;
  const progress = data?.progress;
  const tasks = data?.tasks || [];

  const isActive = buildJob?.status === 'pending' || buildJob?.status === 'running';

  // Error state
  if (error) {
    return (
      <div className={cn('w-full', className)}>
        <div className="text-sm text-destructive">Failed to load build status</div>
      </div>
    );
  }

  // Loading state
  if (isLoading || !buildJob || !progress) {
    return (
      <div className={cn('w-full', className)}>
        <div className="bg-muted/30 border border-border/50 rounded-md p-4 space-y-3">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
          {/* Task skeletons */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-56" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const progressPercentage =
    progress.totalTasks > 0
      ? Math.round(((progress.completedTasks + progress.failedTasks) / progress.totalTasks) * 100)
      : 0;

  // Get task status icon
  const getTaskIcon = (task: BuildTask) => {
    if (task.status === 'done') {
      return <CircleCheck className="h-4 w-4 text-green-500 fill-green-500/10 shrink-0" />;
    }
    if (task.status === 'error') {
      return <CircleX className="h-4 w-4 text-red-500 fill-red-500/10 shrink-0" />;
    }
    if (task.status === 'in_progress') {
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

  // Build status is already set to 'failed' when any tasks fail
  const hasFailed = buildJob.status === 'failed';

  return (
    <div className={cn('w-full', className)}>
      {/* Build container with background - matching tool blocks */}
      <div className="bg-muted/30 border border-border/50 rounded-md p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0">
              {isActive ? (
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
              ) : hasFailed ? (
                <CircleX className="h-5 w-5 text-red-500 fill-red-500/10" />
              ) : (
                <CircleCheck className="h-5 w-5 text-green-500 fill-green-500/10" />
              )}
            </div>
            <span className="text-sm font-semibold text-foreground">Build</span>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {isActive ? 'In progress' : hasFailed ? 'Failed' : 'Completed'}
          </span>
        </div>

        {/* Progress bar and description - only while active */}
        {isActive && (
          <div className="bg-muted/60 border border-border rounded-md p-3 flex items-center gap-3">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {progress.completedTasks + progress.failedTasks} / {progress.totalTasks} tasks
            </span>
            <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{progressPercentage}%</span>
          </div>
        )}

        {/* Task list */}
        {tasks.length > 0 && (
          <div className="space-y-1.5">
            {tasks.map(task => (
              <div key={task.id} className="flex items-center gap-2 text-sm">
                {getTaskIcon(task)}
                <span
                  className={cn(
                    'truncate',
                    task.status === 'done' && 'text-muted-foreground line-through',
                    task.status === 'error' && 'text-red-500',
                    task.status === 'in_progress' && 'text-blue-500 font-medium'
                  )}
                >
                  {task.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
