'use client';

import { AlertCircle, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

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
  const { mutate: deleteProject, isPending } = useDeleteProject();

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [deleteRepo, setDeleteRepo] = useState(false);
  const [repoConfirmationText, setRepoConfirmationText] = useState('');

  useEffect(() => {
    onDeletingChange?.(isPending);
  }, [isPending, onDeletingChange]);

  const resetState = () => {
    setShowConfirmation(false);
    setDeleteRepo(false);
    setRepoConfirmationText('');
  };

  const handleDeleteClick = () => {
    setShowConfirmation(true);
  };

  const handleCancelDelete = () => {
    if (isPending) return;
    resetState();
  };

  const handleDelete = () => {
    deleteProject(
      { projectId: project.id, deleteRepo },
      {
        onSuccess: () => {
          onProjectDeleted?.();
        },
      }
    );
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
              {!isPending ? (
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
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-destructive" />
                  <div className="space-y-0.5">
                    <p className="text-sm text-foreground">
                      Deleting{' '}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {project.name}
                      </code>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {deleteRepo
                        ? 'Removing project files and GitHub repository...'
                        : 'Removing project files...'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
