'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatMessage } from '@/lib/types/chat';
import { GitCommit, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { RevertConfirmationModal } from './revert-confirmation-modal';

interface MessageRevertButtonProps {
  message: ChatMessage;
  projectId: string;
  sessionId: string;
  className?: string;
}

export function MessageRevertButton({
  message,
  projectId,
  sessionId,
  className,
}: MessageRevertButtonProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Only show revert button for assistant messages with commit SHA
  if (message.role !== 'assistant' || !message.commitSha) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${className}`}
            onClick={() => setShowConfirmation(true)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-2">
            <GitCommit className="h-3 w-3" />
            <span>Revert to this state ({message.commitSha?.slice(0, 7)})</span>
          </div>
        </TooltipContent>
      </Tooltip>

      <RevertConfirmationModal
        message={message}
        projectId={projectId}
        sessionId={sessionId}
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
      />
    </TooltipProvider>
  );
}
