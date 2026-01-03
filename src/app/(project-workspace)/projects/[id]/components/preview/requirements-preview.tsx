'use client';

import { CheckCircle2, Loader2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { RequirementsPreviewProps } from '@/lib/types';
import { cn } from '@/lib/utils';
import RequirementsEditor from '../requirements/requirements-editor';

/**
 * Preview component for requirements gathering status
 * Shows the BlockNote editor for requirements document with header actions
 */
export default function RequirementsPreview({
  projectId,
  content,
  className,
  onToggleSidebar,
  isSidebarCollapsed,
  onConfirmRequirements,
  canConfirm,
  isConfirming,
}: RequirementsPreviewProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Determine if button should be disabled and why
  const hasContent = Boolean(content?.trim());
  const isButtonDisabled = !canConfirm || !hasContent;
  const tooltipMessage = !hasContent
    ? 'Describe your requirements in the chat first'
    : 'Confirm your requirements';

  // Save handler for auto-save
  const handleSave = useCallback(
    async (markdown: string) => {
      const response = await fetch(`/api/projects/${projectId}/requirements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: markdown }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save requirements');
      }
    },
    [projectId]
  );

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header with collapse icon and confirm button */}
      <div className="flex items-center justify-between border-b px-4 py-2">
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
          <h3 className="text-sm font-medium text-muted-foreground">Requirements Document</h3>
        </div>

        {/* Confirm Requirements Button */}
        {onConfirmRequirements && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={isButtonDisabled}
                  size="sm"
                  className="h-8"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Requirements
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{tooltipMessage}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {content ? (
        <div className="flex-1 min-h-0 overflow-auto pt-4">
          <RequirementsEditor
            initialContent={content}
            editable={true}
            onSave={handleSave}
            className="h-full"
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4">
          <Alert className="max-w-xl text-center">
            <AlertDescription className="justify-items-center">
              Your requirements document will appear here as you describe your project.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Confirm Requirements Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Requirements</DialogTitle>
            <DialogDescription>
              Are you sure you want to confirm your project requirements? This will send them for
              review and you will be notified when development begins.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onConfirmRequirements?.();
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
                  Confirm Requirements
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
