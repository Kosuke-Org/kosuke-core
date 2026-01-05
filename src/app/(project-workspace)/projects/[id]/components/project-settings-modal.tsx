'use client';

import { AlertCircle, AlertTriangle, Loader2, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useDeleteProject } from '@/hooks/use-projects';

interface ProjectSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: {
    id: string;
    name: string;
    isImported: boolean;
    githubOwner: string | null;
    githubRepoName: string | null;
  };
  onProjectDeleted?: () => void;
}

export default function ProjectSettingsModal({
  open,
  onOpenChange,
  project,
  onProjectDeleted,
}: ProjectSettingsModalProps) {
  const { mutate: deleteProject, isPending, isSuccess, isError } = useDeleteProject();
  const [deleteStage, setDeleteStage] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const [deleteRepo, setDeleteRepo] = useState(false);
  const [repoConfirmationText, setRepoConfirmationText] = useState('');
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const operationStartedRef = useRef<boolean>(false);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current = [];
    };
  }, []);

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

  const handleDelete = async () => {
    try {
      // Reset state for new deletion attempt
      operationStartedRef.current = false;
      setIsCompleting(false);

      // Trigger the deletion
      deleteProject({ projectId: project.id, deleteRepo });
    } catch (error) {
      console.error('Error deleting project:', error);
      setDeleteStage('Error deleting project. Please try again.');
    }
  };

  const isRepoConfirmationValid = !deleteRepo || repoConfirmationText === project.name;
  const isDeleting = isPending || isCompleting;

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        // Prevent closing while operation is in progress
        if (isDeleting) return;
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-[480px] border border-border bg-card">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <DialogTitle>Project Settings</DialogTitle>
          </div>
          <DialogDescription>Manage project configuration and maintenance</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Maintenance Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Maintenance</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sync-rules" className="text-sm font-normal">
                    Sync Rules
                  </Label>
                  <p className="text-xs text-muted-foreground">Automatically sync project rules</p>
                </div>
                <Switch id="sync-rules" disabled />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="analyze" className="text-sm font-normal">
                    Analyze
                  </Label>
                  <p className="text-xs text-muted-foreground">Enable code analysis features</p>
                </div>
                <Switch id="analyze" disabled />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="security-check" className="text-sm font-normal">
                    Security Check
                  </Label>
                  <p className="text-xs text-muted-foreground">Run security vulnerability scans</p>
                </div>
                <Switch id="security-check" disabled />
              </div>
            </div>
          </div>

          <Separator />

          {/* Danger Zone Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-destructive">Danger Zone</h3>
            <div className="rounded-lg border border-destructive/30 p-4 space-y-4">
              {!isDeleting ? (
                <>
                  <p className="text-sm text-foreground">
                    Delete project{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                      {project.name}
                    </code>
                  </p>

                  <div className="flex gap-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      This action cannot be undone. All project files will be permanently removed.
                    </p>
                  </div>

                  {!project.isImported && (
                    <div className="space-y-3 pt-2">
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
                        <Label htmlFor="delete-repo" className="text-sm font-medium cursor-pointer">
                          Also delete GitHub repository
                        </Label>
                      </div>

                      {deleteRepo && (
                        <div className="ml-6 space-y-3">
                          <div className="bg-destructive/5 rounded-lg p-3 border border-destructive/20">
                            <p className="text-xs text-destructive flex items-start gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>
                                The GitHub repository will also be permanently deleted and cannot be
                                undone.
                              </span>
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="repo-confirm" className="text-xs font-medium">
                              Type project name to confirm
                            </Label>
                            <Input
                              id="repo-confirm"
                              placeholder={project.name}
                              value={repoConfirmationText}
                              onChange={e => setRepoConfirmationText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && isRepoConfirmationValid) {
                                  handleDelete();
                                }
                              }}
                              className="text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={!isRepoConfirmationValid}
                    className="w-full"
                  >
                    Delete Project
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Deleting project files. This may take a moment, please don&apos;t close this
                    window.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center mb-2">
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <div className="h-4 w-4 rounded-full bg-green-500 mr-2" />
                      )}
                      <span className="text-sm text-muted-foreground">{deleteStage}</span>
                    </div>
                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ease-in-out ${
                          isSuccess ? 'bg-green-500' : 'bg-primary'
                        }`}
                        style={{ width: `${deleteProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
