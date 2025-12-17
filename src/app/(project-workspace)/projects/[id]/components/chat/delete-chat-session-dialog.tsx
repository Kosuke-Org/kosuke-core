'use client';

import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ChatSession } from '@/lib/types';

interface DeleteChatSessionDialogProps {
  session: ChatSession | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (session: ChatSession) => void | Promise<void>;
  isDeleting: boolean;
}

export function DeleteChatSessionDialog({
  session,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
}: DeleteChatSessionDialogProps) {
  const handleDelete = async () => {
    if (!session) return;
    await onConfirm(session);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        // Prevent closing while deletion is in progress
        if (isDeleting) return;
        onOpenChange(value);
      }}
    >
      <DialogContent className="sm:max-w-[425px] border border-border bg-card">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <DialogTitle>Delete Chat Session</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-foreground">
            Are you sure you want to delete chat session{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {session?.title}
            </code>
            ?
          </p>

          <div className="flex gap-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. All messages in this session will be permanently
              removed.
            </p>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>Deleting...</span>
              </>
            ) : (
              'Delete Session'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
