'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import type { RequirementsPreviewProps } from '@/lib/types';
import { cn } from '@/lib/utils';
import MarkdownPreview from '../requirements/markdown-preview';

/**
 * Preview component for requirements gathering status
 * Shows the markdown requirements document
 */
export default function RequirementsPreview({ content, className }: RequirementsPreviewProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="border-b p-3">
        <h3 className="text-sm font-medium text-muted-foreground">Requirements Document</h3>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          {content ? (
            <MarkdownPreview content={content} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Your requirements document will appear here as you describe your project...
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
