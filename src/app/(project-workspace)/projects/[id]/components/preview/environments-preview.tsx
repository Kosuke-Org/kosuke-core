'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEnvironmentJob } from '@/hooks/use-environment-job';
import { useEnvironmentValues } from '@/hooks/use-environment-values';
import { useRetriggerEnvironment } from '@/hooks/use-retrigger-environment';
import { useUpdateEnvironment } from '@/hooks/use-update-environment';
import type { EnvironmentsPreviewProps } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

// Skeleton for loading state
function EnvironmentsSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

// Analyzing state component
function AnalyzingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-full bg-blue-100 p-4 dark:bg-blue-900/30">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Analyzing Environment</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Analyzing your project requirements to determine the necessary environment variables. This
        may take a moment...
      </p>
    </div>
  );
}

// Error state component
function AnalysisErrorState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <Alert variant="destructive" className="max-w-md">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Analysis Failed</AlertTitle>
        <AlertDescription className="mt-2">
          {error || 'Failed to analyze environment variables. Please try again.'}
        </AlertDescription>
      </Alert>
      <Button variant="outline" onClick={onRetry} className="mt-4">
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry Analysis
      </Button>
    </div>
  );
}

/**
 * Preview component for environments status
 * Shows environment variable inputs for users to fill in
 */
export default function EnvironmentsPreview({
  projectId,
  className,
  onToggleSidebar,
  isSidebarCollapsed,
  onConfirmEnvironment,
  isConfirming,
}: EnvironmentsPreviewProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showReanalyzeModal, setShowReanalyzeModal] = useState(false);
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Poll environment job status
  const {
    job,
    isPolling,
    isCompleted,
    isFailed,
    refetch: refetchJob,
  } = useEnvironmentJob(projectId);

  // Only fetch environment values when job is completed
  const { data: environment, isLoading } = useEnvironmentValues(projectId, {
    projectStatus: 'requirements_ready',
    enabled: isCompleted, // Only fetch after job is done
  });

  const updateMutation = useUpdateEnvironment(projectId);
  const retriggerMutation = useRetriggerEnvironment(projectId);

  // Merge server values with local edits
  const mergedValues = useMemo(() => {
    return { ...(environment || {}), ...localValues };
  }, [environment, localValues]);

  // Check how many values are empty
  const emptyCount = useMemo(() => {
    return Object.values(mergedValues).filter(v => v === '').length;
  }, [mergedValues]);

  const canConfirmEnv = emptyCount === 0 && Object.keys(mergedValues).length > 0;

  // Handle value change
  const handleValueChange = useCallback((key: string, value: string) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
  }, []);

  // Save all values
  const handleSave = useCallback(async () => {
    await updateMutation.mutateAsync(mergedValues);
    setLocalValues({});
  }, [mergedValues, updateMutation]);

  // Toggle secret visibility
  const toggleSecretVisibility = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Determine if a key is likely a secret
  const isSecretKey = (key: string): boolean => {
    const secretPatterns = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'CREDENTIAL'];
    return secretPatterns.some(pattern => key.toUpperCase().includes(pattern));
  };

  // Show analyzing state while job is pending/running
  if (isPolling || (job && job.status === 'pending') || (job && job.status === 'running')) {
    return (
      <div className={cn('flex h-full flex-col', className)}>
        <div className="flex h-12 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            {onToggleSidebar && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                className="h-8 w-8"
                aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </Button>
            )}
            <h3 className="text-sm font-medium text-muted-foreground">Environment Setup</h3>
            <Badge variant="secondary" className="text-xs">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Analyzing
            </Badge>
          </div>
        </div>
        <AnalyzingState />
      </div>
    );
  }

  // Show error state if job failed
  if (isFailed) {
    return (
      <div className={cn('flex h-full flex-col', className)}>
        <div className="flex h-12 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            {onToggleSidebar && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                className="h-8 w-8"
                aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </Button>
            )}
            <h3 className="text-sm font-medium text-muted-foreground">Environment Setup</h3>
            <Badge variant="destructive" className="text-xs">
              Failed
            </Badge>
          </div>
        </div>
        <AnalysisErrorState error={job?.error ?? null} onRetry={() => refetchJob()} />
      </div>
    );
  }

  // Show loading skeleton while fetching environment values
  if (isLoading) {
    return (
      <div className={cn('flex h-full flex-col', className)}>
        <div className="flex h-12 items-center justify-between border-b px-4">
          <Skeleton className="h-6 w-32" />
        </div>
        <EnvironmentsSkeleton />
      </div>
    );
  }

  const envEntries = Object.entries(mergedValues);
  const hasLocalChanges = Object.keys(localValues).length > 0;

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="h-8 w-8"
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </Button>
          )}
          <h3 className="text-sm font-medium text-muted-foreground">Environment Setup</h3>
          {emptyCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {emptyCount} empty
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowReanalyzeModal(true)}
                disabled={retriggerMutation.isPending}
                className="h-8 w-8"
              >
                <RefreshCw
                  className={cn('h-4 w-4', retriggerMutation.isPending && 'animate-spin')}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Re-analyze environment variables</TooltipContent>
          </Tooltip>

          {hasLocalChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          )}

          {onConfirmEnvironment && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={() => setShowConfirmModal(true)}
                    disabled={!canConfirmEnv}
                    size="sm"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Confirm
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {canConfirmEnv
                  ? 'Confirm environment configuration'
                  : 'Fill all environment variables first'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 h-0">
        {envEntries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <Alert className="max-w-xl">
              <AlertDescription>
                No environment variables detected. The environment analysis may still be running.
                Please wait a moment and refresh.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="px-6 py-4 space-y-6">
            <div className="space-y-1">
              <h4 className="text-base font-medium">Environment Variables</h4>
              <p className="text-sm text-muted-foreground">Fill in all required values.</p>
            </div>
            <div className="space-y-4">
              {envEntries.map(([key, value]) => {
                const isSecret = isSecretKey(key);
                const showValue = showSecrets[key] ?? false;

                return (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={key} className="text-sm font-mono">
                      {key}
                    </Label>
                    <div className="relative">
                      <Input
                        id={key}
                        type={isSecret && !showValue ? 'password' : 'text'}
                        value={value}
                        onChange={e => handleValueChange(key, e.target.value)}
                        placeholder={`Enter ${key}`}
                        className="font-mono pr-10"
                      />
                      {isSecret && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                          onClick={() => toggleSecretVisibility(key)}
                          title={showValue ? 'Hide value' : 'Show value'}
                        >
                          {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Confirm Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Environment</DialogTitle>
            <DialogDescription>
              Are you sure all environment variables are correctly configured? This will save your
              configuration and proceed to payment.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (hasLocalChanges) {
                  await handleSave();
                }
                onConfirmEnvironment?.();
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
                  Confirm Environment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-analyze Warning Modal */}
      <Dialog open={showReanalyzeModal} onOpenChange={setShowReanalyzeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-analyze Environment</DialogTitle>
            <DialogDescription>
              This will re-analyze your project requirements and may detect different environment
              variables. Any values you&apos;ve entered will be preserved for matching variable
              names, but new variables may be added or existing ones removed.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This action cannot be undone. Make sure to save any important values before
              proceeding.
            </AlertDescription>
          </Alert>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowReanalyzeModal(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await retriggerMutation.mutateAsync();
                setShowReanalyzeModal(false);
              }}
              disabled={retriggerMutation.isPending}
            >
              {retriggerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Re-analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-analyze
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
