'use client';

import { AlertCircle, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeleteProject } from '@/hooks/use-projects';
import type { Project } from '@/lib/db/schema';

interface DeleteProjectSectionProps {
  project: Project;
  onProjectDeleted?: () => void;
  /** Whether deletion is in progress - parent can use this to prevent modal close */
  onDeletingChange?: (isDeleting: boolean) => void;
}

export function DeleteProjectSection({
  project,
  onProjectDeleted,
  onDeletingChange,
}: DeleteProjectSectionProps) {
  const { mutate: deleteProject, isPending, isSuccess, isError } = useDeleteProject();

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [deleteRepo, setDeleteRepo] = useState(false);
  const [repoConfirmationText, setRepoConfirmationText] = useState('');
  const [deleteStage, setDeleteStage] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const operationStartedRef = useRef<boolean>(false);

  const isDeleting = isPending || isCompleting;

  // Notify parent of deletion state changes
  useEffect(() => {
    onDeletingChange?.(isDeleting);
  }, [isDeleting, onDeletingChange]);

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

      // Add a delay before calling callback to show the success state
      const timer = setTimeout(() => {
        onProjectDeleted?.();

        // Reset state after callback
        setTimeout(() => {
          resetState();
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
  }, [isPending, isSuccess, isError, isCompleting, onProjectDeleted]);

  const resetState = () => {
    setShowConfirmation(false);
    setDeleteRepo(false);
    setRepoConfirmationText('');
    setDeleteStage(null);
    setDeleteProgress(0);
    setIsCompleting(false);
    operationStartedRef.current = false;
  };

  const handleDeleteClick = () => {
    setShowConfirmation(true);
  };

  const handleCancelDelete = () => {
    if (isDeleting) return;
    resetState();
  };

  const handleDelete = () => {
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

  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          {!showConfirmation ? (
            // Initial state - show description and delete button
            <>
              <div>
                <p className="text-sm font-medium text-foreground">Delete Project</p>
                <p className="text-xs text-muted-foreground">
                  Permanently delete this project and all associated data. This action cannot be
                  undone.
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleDeleteClick} className="gap-2">
                <Trash2 className="h-4 w-4" />
                Delete Project
              </Button>
            </>
          ) : (
            // Expanded confirmation state
            <div className="space-y-4">
              {!isDeleting ? (
                <>
                  <p className="text-sm text-foreground">
                    Are you sure you want to delete project{' '}
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                      {project.name}
                    </code>
                    ?
                  </p>

                  <div className="flex gap-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">
                      This action cannot be undone. All project files will be permanently removed.
                    </p>
                  </div>

                  {!project.isImported && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="delete-repo-inline"
                          checked={deleteRepo}
                          onCheckedChange={v => {
                            setDeleteRepo(Boolean(v));
                            if (!v) setRepoConfirmationText('');
                          }}
                          className="mt-1"
                        />
                        <Label
                          htmlFor="delete-repo-inline"
                          className="text-sm font-medium cursor-pointer"
                        >
                          Also delete GitHub repository
                        </Label>
                      </div>

                      {deleteRepo && (
                        <div className="ml-6 space-y-3">
                          <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/30">
                            <p className="text-xs text-destructive flex items-start gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>
                                The GitHub repository will also be permanently deleted and cannot be
                                undone.
                              </span>
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="repo-confirm-inline" className="text-xs font-medium">
                              Type project name to confirm
                            </Label>
                            <Input
                              id="repo-confirm-inline"
                              placeholder={project.name}
                              value={repoConfirmationText}
                              onChange={e => setRepoConfirmationText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && isRepoConfirmationValid) {
                                  handleDelete();
                                }
                              }}
                              className="text-sm"
                              autoFocus
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={handleCancelDelete}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={!isRepoConfirmationValid}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Confirm Delete
                    </Button>
                  </div>
                </>
              ) : (
                // Deletion in progress
                <>
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
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
