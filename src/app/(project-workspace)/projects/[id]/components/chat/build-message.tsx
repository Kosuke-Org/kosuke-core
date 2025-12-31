'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBuildStatus } from '@/hooks/use-build-status';
import { useCancelBuild } from '@/hooks/use-cancel-build';
import { useLatestBuild } from '@/hooks/use-latest-build';
import { useRestartBuild } from '@/hooks/use-restart-build';
import type { BuildTask } from '@/lib/types/chat';
import { cn } from '@/lib/utils';
import { Circle, CircleCheck, CircleX, Loader2, RotateCcw, Square, StopCircle } from 'lucide-react';

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
  const { data, isLoading, error } = useBuildStatus({ projectId, sessionId, buildJobId });

  // Cancel build mutation
  const cancelMutation = useCancelBuild({ projectId, sessionId, buildJobId });

  // Restart build mutation
  const restartMutation = useRestartBuild({ projectId, sessionId, buildJobId });

  // Check if this is the latest build (only show restart for latest failed build)
  const { data: latestBuildData } = useLatestBuild(projectId, sessionId);
  const isLatestBuild = latestBuildData?.buildJobId === buildJobId;

  const buildJob = data?.buildJob;
  const progress = data?.progress;
  const rawTasks = data?.tasks || [];

  // Quality check status derived from build status
  const qualityCheckStatus: BuildTask['status'] =
    buildJob?.status === 'completed'
      ? 'done'
      : buildJob?.status === 'validating'
        ? 'in_progress'
        : 'todo';

  const qualityCheckTask: BuildTask = {
    id: 'quality-check',
    externalId: 'quality-check',
    title: 'Quality check',
    description: '',
    type: null,
    category: null,
    estimatedEffort: 0,
    status: qualityCheckStatus,
    error: null,
    cost: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const tasks = [...rawTasks, qualityCheckTask];

  const isActive =
    buildJob?.status === 'pending' ||
    buildJob?.status === 'running' ||
    buildJob?.status === 'validating';

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

  // Get task status icon
  const getTaskIcon = (task: BuildTask) => {
    if (task.status === 'done') {
      return <CircleCheck className="h-4 w-4 text-green-500 fill-green-500/10 shrink-0" />;
    }
    if (task.status === 'error') {
      return <CircleX className="h-4 w-4 text-red-500 fill-red-500/10 shrink-0" />;
    }
    if (task.status === 'cancelled') {
      return <StopCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
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

  // Build status states
  const hasFailed = buildJob.status === 'failed';
  const isCancelled = buildJob.status === 'cancelled';

  // Calculate progress from tasks array (includes quality check)
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'done' || t.status === 'error').length;
  const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className={cn('w-full', className)}>
      {/* Build container with background - matching tool blocks */}
      <div className="bg-muted/30 border border-border/50 rounded-md p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Build</span>
            {isActive && (
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        disabled={cancelMutation.isPending}
                      >
                        {cancelMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Square className="h-3.5 w-3.5 fill-current" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Stop build</TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Stop build?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will cancel the current build. Any progress will be lost.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Continue</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Stop
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {(hasFailed || isCancelled) && isLatestBuild && (
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-primary"
                        disabled={restartMutation.isPending}
                      >
                        {restartMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Restart build</TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restart build?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will revert all changes and restart the build from scratch.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => restartMutation.mutate()}>
                      Restart
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          {/* Status pills */}
          {isActive && (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
              In progress
            </div>
          )}
          {buildJob?.status === 'completed' && (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Ready to test
            </div>
          )}
          {buildJob?.status === 'failed' && (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Failed
            </div>
          )}
          {buildJob?.status === 'cancelled' && (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              Cancelled
            </div>
          )}
        </div>

        {/* Progress bar and description - always visible */}
        <div className="bg-muted/60 border border-border rounded-md p-3 flex items-center gap-3">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {completedTasks} / {totalTasks} tasks
          </span>
          <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{progressPercentage}%</span>
        </div>

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
                    task.status === 'cancelled' && 'text-muted-foreground',
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
