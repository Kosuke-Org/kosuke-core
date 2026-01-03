'use client';

import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import RequirementsEditor from '../requirements/requirements-editor';

interface RequirementsReadyPreviewProps {
  content?: string;
  projectName?: string;
  className?: string;
}

/**
 * Preview component for requirements_ready status
 * Shows success state with option to view requirements
 */
export default function RequirementsReadyPreview({
  content,
  projectName,
  className,
}: RequirementsReadyPreviewProps) {
  const [showDocs, setShowDocs] = useState(false);

  if (showDocs && content) {
    return (
      <div className={cn('flex h-full flex-col', className)}>
        <div className="flex items-center justify-between border-b p-3">
          <h3 className="text-sm font-medium text-muted-foreground">Requirements Document</h3>
          <button
            onClick={() => setShowDocs(false)}
            className="text-sm text-primary hover:underline"
          >
            Back
          </button>
        </div>
        <ScrollArea className="flex-1">
          <RequirementsEditor initialContent={content} editable={false} className="h-full" />
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col items-center justify-center gap-4 p-8', className)}>
      <CheckCircle2 className="h-16 w-16 text-green-500" />
      <h2 className="text-2xl font-semibold">Requirements Submitted</h2>
      <p className="max-w-md text-center text-muted-foreground">
        Your requirements for <span className="font-medium">{projectName}</span> have been confirmed
        and sent for review.
        <br />
        <br />
        You will be notified when development begins.
      </p>
      <Badge variant="outline">Requirements Ready</Badge>

      {content && (
        <button
          onClick={() => setShowDocs(true)}
          className="mt-4 text-sm text-primary hover:underline"
        >
          View Requirements Document
        </button>
      )}
    </div>
  );
}
