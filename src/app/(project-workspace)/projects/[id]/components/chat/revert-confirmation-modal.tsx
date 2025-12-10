'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRevertToMessage } from '@/hooks/use-message-operations';
import type { ChatMessage } from '@/lib/types/chat';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, GitCommit, RotateCcw } from 'lucide-react';

interface RevertConfirmationModalProps {
  message: ChatMessage;
  projectId: string;
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RevertConfirmationModal({
  message,
  projectId,
  sessionId,
  isOpen,
  onClose,
}: RevertConfirmationModalProps) {
  const revertMutation = useRevertToMessage(projectId, sessionId);

  const handleRevert = () => {
    revertMutation.mutate(
      { message_id: message.id },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] border border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            Revert to Assistant Message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This will revert your chat session to the state when this assistant message was created.
              Any changes made after this point will remain in Git history but won&apos;t be visible in
              your working directory.
            </AlertDescription>
          </Alert>

          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <GitCommit className="h-4 w-4" />
              Commit Details
            </h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>
                <strong>Commit SHA:</strong> {message.commitSha}
              </div>
              <div>
                <strong>Created:</strong>{' '}
                {formatDistanceToNow(new Date(message.timestamp), { addSuffix: true })}
              </div>
              <div>
                <strong>Message Preview:</strong> {message.content?.slice(0, 100) || 'Assistant response'}...
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={revertMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevert}
              className="flex-1"
              disabled={revertMutation.isPending}
            >
              {revertMutation.isPending ? (
                <>
                  <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                  Reverting...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Revert Chat Session
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
