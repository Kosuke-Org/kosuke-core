'use client';

import { AlertCircle, AlertTriangle, Loader2, Trash } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeleteProject } from '@/hooks/use-projects';
import type { Project } from '@/lib/db/schema';

interface DeleteProjectDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
}: DeleteProjectDialogProps) {
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
        // Don't go to 100% - we'll do that when operation actually completes
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
  }, [isPending, isSuccess, isError, isCompleting, onOpenChange]);

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

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        // Prevent closing while operation is in progress
        if (isPending || isCompleting) return;
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-[425px] border border-border bg-card">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Trash className="h-5 w-5 text-destructive" />
            <DialogTitle>Delete Project</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {!isPending && !isSuccess ? (
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
                          autoFocus
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Deleting project files. This may take a moment, please don&apos;t close this window.
            </p>
          )}

          {(isPending || isSuccess) && (
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
          )}
        </div>

        <DialogFooter className="mt-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending || isCompleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending || isCompleting || !isRepoConfirmationValid}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>Deleting...</span>
              </>
            ) : (
              'Delete Project'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
