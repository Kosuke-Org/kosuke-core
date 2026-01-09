'use client';

import { formatDistanceToNow } from 'date-fns';
import { RefreshCw, Search, Shield } from 'lucide-react';
import { useState } from 'react';

import { DeleteProjectSection } from '@/app/(logged-in)/projects/components/delete-project-section';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useMaintenanceJobs, useUpdateMaintenanceJob } from '@/hooks/use-maintenance-jobs';
import type { MaintenanceJobType, Project } from '@/lib/db/schema';
import type { MaintenanceJobWithRun } from '@/lib/types';

interface ProjectSettingsModalProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectDeleted?: () => void;
  isAdmin?: boolean;
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
}: {
  jobType: MaintenanceJobType;
  icon: React.ReactNode;
  label: string;
  description: string;
  config: MaintenanceJobWithRun | undefined;
  onToggle: (jobType: MaintenanceJobType, enabled: boolean) => void;
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
      />
    </div>
  );
}

export function ProjectSettingsModal({
  project,
  open,
  onOpenChange,
  onProjectDeleted,
  isAdmin = false,
}: ProjectSettingsModalProps) {
  // Track if deletion is in progress to prevent modal close
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch maintenance jobs from API
  const { data: jobs, isLoading } = useMaintenanceJobs(project.id);
  const updateJob = useUpdateMaintenanceJob(project.id);

  // Handle modal close - prevent during deletion
  const handleOpenChange = (value: boolean) => {
    if (isDeleting) return;
    onOpenChange(value);
  };

  const handleProjectDeleted = () => {
    onOpenChange(false);
    onProjectDeleted?.();
  };

  const handleToggle = (jobType: MaintenanceJobType, enabled: boolean) => {
    updateJob.mutate({ jobType, enabled });
  };

  // Helper to get config for a specific job type
  const getJobConfig = (jobType: MaintenanceJobType) => {
    return jobs?.find(j => j.jobType === jobType);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                />

                <MaintenanceToggle
                  jobType="code_analysis"
                  icon={<Search className="h-4 w-4 text-muted-foreground" />}
                  label="Code Analysis"
                  description="Run code analysis on changes (every 14 days)"
                  config={getJobConfig('code_analysis')}
                  onToggle={handleToggle}
                />

                <MaintenanceToggle
                  jobType="security_check"
                  icon={<Shield className="h-4 w-4 text-muted-foreground" />}
                  label="Security Check"
                  description="Scan for security vulnerabilities (every 3 days)"
                  config={getJobConfig('security_check')}
                  onToggle={handleToggle}
                />
              </div>
            )}
          </div>

          {isAdmin && (
            <>
              <Separator />

              {/* Danger Zone */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
                <DeleteProjectSection
                  project={project}
                  onProjectDeleted={handleProjectDeleted}
                  onDeletingChange={setIsDeleting}
                />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
