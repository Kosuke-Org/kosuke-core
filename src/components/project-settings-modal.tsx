'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useDeleteProject } from '@/hooks/use-projects';
import {
  useMaintenanceJobs,
  useUpdateMaintenanceJob,
  type MaintenanceJobWithRun,
} from '@/hooks/use-maintenance-jobs';
import type { MaintenanceJobType, Project } from '@/lib/db/schema';
import { cn } from '@/lib/utils';

interface ProjectSettingsModalProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectDeleted?: () => void;
}

/**
 * Status indicator component for maintenance jobs
 */
function StatusIndicator({ status, isRunning }: { status?: string | null; isRunning?: boolean }) {
  if (isRunning) {
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
    );
  }

  if (status === 'completed') {
    return <span className="h-2 w-2 rounded-full bg-green-500" />;
  }

  if (status === 'failed') {
    return <span className="h-2 w-2 rounded-full bg-red-500" />;
  }

  return null;
}

/**
 * Loading skeleton for maintenance section
 */
function MaintenanceSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <Skeleton className="h-5 w-9 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Maintenance toggle row component
 */
function MaintenanceToggle({
  jobType,
  icon,
  label,
  description,
  config,
  onToggle,
  isUpdating,
}: {
  jobType: MaintenanceJobType;
  icon: React.ReactNode;
  label: string;
  description: string;
  config: MaintenanceJobWithRun | undefined;
  onToggle: (jobType: MaintenanceJobType, enabled: boolean) => void;
  isUpdating: boolean;
}) {
  const isEnabled = config?.enabled ?? false;
  const latestRun = config?.latestRun;
  const isRunning = latestRun?.status === 'running' || latestRun?.status === 'pending';

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {icon}
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label htmlFor={jobType} className="text-sm font-medium">
              {label}
            </Label>
            <StatusIndicator status={latestRun?.status} isRunning={isRunning} />
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
          {latestRun && (
            <p className="text-xs text-muted-foreground">
              Last run: {formatDistanceToNow(new Date(latestRun.createdAt), { addSuffix: true })}
              {latestRun.status === 'failed' && <span className="text-red-500 ml-1">- Failed</span>}
            </p>
          )}
          {config?.nextRunAt && isEnabled && (
            <p className="text-xs text-muted-foreground">
              Next run: {formatDistanceToNow(new Date(config.nextRunAt), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>
      <Switch
        id={jobType}
        checked={isEnabled}
        onCheckedChange={checked => onToggle(jobType, checked)}
        disabled={isUpdating}
      />
    </div>
  );
}

export function ProjectSettingsModal({
  project,
  open,
  onOpenChange,
  onProjectDeleted,
}: ProjectSettingsModalProps) {
  // Confirmation state for inline delete
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteRepo, setDeleteRepo] = useState(false);
  const [repoConfirmationText, setRepoConfirmationText] = useState('');
  const [deleteStage, setDeleteStage] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const operationStartedRef = useRef<boolean>(false);

  // Fetch maintenance jobs from API
  const { data: jobs, isLoading } = useMaintenanceJobs(project.id);
  const updateJob = useUpdateMaintenanceJob(project.id);
  const { mutate: deleteProject, isPending, isSuccess, isError } = useDeleteProject();

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current = [];
    };
  }, []);

  // Reset delete confirmation state when modal closes
  useEffect(() => {
    if (!open) {
      setShowDeleteConfirmation(false);
      setDeleteRepo(false);
      setRepoConfirmationText('');
      setDeleteStage(null);
      setDeleteProgress(0);
      setIsCompleting(false);
      operationStartedRef.current = false;
    }
  }, [open]);

  // Handle the deletion progress visualization
  useEffect(() => {
    // When operation starts
    if (isPending && !operationStartedRef.current) {
      operationStartedRef.current = true;
      setDeleteStage('Preparing to delete project...');
      setDeleteProgress(10);

      // Clear any existing timers
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current = [];

      // Set up progressive indicators for better UX
      const stages = [
        { time: 800, stage: 'Cleaning up project files...', progress: 25 },
        { time: 2000, stage: 'Removing node_modules...', progress: 40 },
        { time: 4000, stage: 'Deleting project directory...', progress: 60 },
        { time: 6000, stage: 'Finalizing deletion...', progress: 85 },
      ];

      stages.forEach(({ time, stage, progress }) => {
        const timer = setTimeout(() => {
          if (isPending) {
            setDeleteStage(stage);
            setDeleteProgress(progress);
          }
        }, time);

        timersRef.current.push(timer);
      });
    }

    // When operation succeeds
    if (isSuccess && !isCompleting && operationStartedRef.current) {
      setDeleteStage('Project deleted successfully!');
      setDeleteProgress(100);
      setIsCompleting(true);

      // Add a delay before closing to show the success state
      const timer = setTimeout(() => {
        onOpenChange(false);
        onProjectDeleted?.();

        // Reset state after dialog closes
        setTimeout(() => {
          setDeleteStage(null);
          setDeleteProgress(0);
          setIsCompleting(false);
          operationStartedRef.current = false;
          setRepoConfirmationText('');
          setShowDeleteConfirmation(false);
          setDeleteRepo(false);
        }, 300);
      }, 1000);

      timersRef.current.push(timer);
    }

    // When operation errors
    if (isError && operationStartedRef.current) {
      setDeleteStage('Error deleting project. Please try again.');
      setDeleteProgress(0);
      operationStartedRef.current = false;
    }
  }, [isPending, isSuccess, isError, isCompleting, onOpenChange, onProjectDeleted]);

  const handleDeleteClick = () => {
    setShowDeleteConfirmation(true);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirmation(false);
    setDeleteRepo(false);
    setRepoConfirmationText('');
  };

  const handleConfirmDelete = () => {
    operationStartedRef.current = false;
    setIsCompleting(false);
    deleteProject({ projectId: project.id, deleteRepo });
  };

  const isRepoConfirmationValid = !deleteRepo || repoConfirmationText === project.name;

  const handleToggle = (jobType: MaintenanceJobType, enabled: boolean) => {
    updateJob.mutate({ jobType, enabled });
  };

  // Helper to get config for a specific job type
  const getJobConfig = (jobType: MaintenanceJobType) => {
    return jobs?.find(j => j.jobType === jobType);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Project Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Maintenance Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground">Maintenance</h3>
              {isLoading ? (
                <MaintenanceSkeleton />
              ) : (
                <div className="space-y-4">
                  <MaintenanceToggle
                    jobType="sync_rules"
                    icon={<RefreshCw className="h-4 w-4 text-muted-foreground" />}
                    label="Sync Rules"
                    description="Automatically sync project rules (every 7 days)"
                    config={getJobConfig('sync_rules')}
                    onToggle={handleToggle}
                    isUpdating={updateJob.isPending}
                  />

                  <MaintenanceToggle
                    jobType="analyze"
                    icon={<Search className="h-4 w-4 text-muted-foreground" />}
                    label="Analyze"
                    description="Run code analysis on changes (every 14 days)"
                    config={getJobConfig('analyze')}
                    onToggle={handleToggle}
                    isUpdating={updateJob.isPending}
                  />

                  <MaintenanceToggle
                    jobType="security_check"
                    icon={<Shield className="h-4 w-4 text-muted-foreground" />}
                    label="Security Check"
                    description="Scan for security vulnerabilities (every 3 days)"
                    config={getJobConfig('security_check')}
                    onToggle={handleToggle}
                    isUpdating={updateJob.isPending}
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* Danger Zone */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
              <div
                className={cn(
                  'rounded-lg border p-4 transition-colors duration-300',
                  showDeleteConfirmation
                    ? 'border-destructive/40 bg-destructive/10'
                    : 'border-destructive/20 bg-destructive/5'
                )}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={cn(
                      'h-5 w-5 shrink-0 mt-0.5 transition-colors duration-300',
                      showDeleteConfirmation ? 'text-destructive' : 'text-destructive/70'
                    )}
                  />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Delete Project</p>
                      <p className="text-xs text-muted-foreground">
                        Permanently delete this project and all associated data. This action cannot
                        be undone.
                      </p>
                    </div>

                    {/* Delete button - shown when not in confirmation mode */}
                    <div
                      className={cn(
                        'grid transition-all duration-300 ease-in-out',
                        showDeleteConfirmation
                          ? 'grid-rows-[0fr] opacity-0'
                          : 'grid-rows-[1fr] opacity-100'
                      )}
                    >
                      <div className="overflow-hidden">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleDeleteClick}
                          className="gap-2"
                          tabIndex={showDeleteConfirmation ? -1 : 0}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete Project
                        </Button>
                      </div>
                    </div>

                    {/* Confirmation section - expands when in confirmation mode */}
                    <div
                      className={cn(
                        'grid transition-all duration-300 ease-in-out',
                        showDeleteConfirmation
                          ? 'grid-rows-[1fr] opacity-100'
                          : 'grid-rows-[0fr] opacity-0'
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="space-y-4 pt-1">
                          {!isPending && !isSuccess ? (
                            <>
                              <div className="flex gap-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 animate-in fade-in-0 slide-in-from-top-2 duration-300">
                                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-muted-foreground">
                                  Are you sure? This action cannot be undone. All project files will
                                  be permanently removed.
                                </p>
                              </div>

                              {!project.isImported && (
                                <div className="space-y-3 animate-in fade-in-0 slide-in-from-top-1 duration-300 delay-75">
                                  <div className="flex items-start gap-3">
                                    <Checkbox
                                      id="delete-repo"
                                      checked={deleteRepo}
                                      onCheckedChange={v => {
                                        setDeleteRepo(Boolean(v));
                                        if (!v) setRepoConfirmationText('');
                                      }}
                                      className="mt-1"
                                    />
                                    <Label
                                      htmlFor="delete-repo"
                                      className="text-sm font-medium cursor-pointer"
                                    >
                                      Also delete GitHub repository
                                    </Label>
                                  </div>

                                  {/* GitHub repo confirmation - animated expansion */}
                                  <div
                                    className={cn(
                                      'grid transition-all duration-300 ease-in-out ml-6',
                                      deleteRepo
                                        ? 'grid-rows-[1fr] opacity-100'
                                        : 'grid-rows-[0fr] opacity-0'
                                    )}
                                  >
                                    <div className="overflow-hidden">
                                      <div className="space-y-3">
                                        <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/20">
                                          <p className="text-xs text-destructive flex items-start gap-1.5">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                            <span>
                                              The GitHub repository will also be permanently deleted
                                              and cannot be undone.
                                            </span>
                                          </p>
                                        </div>

                                        <div className="space-y-2">
                                          <Label
                                            htmlFor="repo-confirm"
                                            className="text-xs font-medium"
                                          >
                                            Type{' '}
                                            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                                              {project.name}
                                            </code>{' '}
                                            to confirm
                                          </Label>
                                          <Input
                                            id="repo-confirm"
                                            placeholder={project.name}
                                            value={repoConfirmationText}
                                            onChange={e => setRepoConfirmationText(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter' && isRepoConfirmationValid) {
                                                handleConfirmDelete();
                                              }
                                            }}
                                            className="text-sm"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground animate-in fade-in-0 duration-200">
                              Deleting project files. This may take a moment, please don&apos;t
                              close this window.
                            </p>
                          )}

                          {/* Progress indicator */}
                          <div
                            className={cn(
                              'grid transition-all duration-300 ease-in-out',
                              isPending || isSuccess
                                ? 'grid-rows-[1fr] opacity-100'
                                : 'grid-rows-[0fr] opacity-0'
                            )}
                          >
                            <div className="overflow-hidden">
                              <div className="space-y-2">
                                <div className="flex items-center">
                                  {isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2 text-muted-foreground" />
                                  ) : (
                                    <div className="h-4 w-4 rounded-full bg-green-500 mr-2 animate-in zoom-in-50 duration-200" />
                                  )}
                                  <span className="text-sm text-muted-foreground">
                                    {deleteStage}
                                  </span>
                                </div>
                                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full transition-all duration-500 ease-out',
                                      isSuccess ? 'bg-green-500' : 'bg-primary'
                                    )}
                                    style={{ width: `${deleteProgress}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 delay-100">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleCancelDelete}
                              disabled={isPending || isCompleting}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={handleConfirmDelete}
                              disabled={isPending || isCompleting || !isRepoConfirmationValid}
                              className="min-w-[120px]"
                            >
                              {isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Deleting...
                                </>
                              ) : (
                                'Confirm Delete'
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
