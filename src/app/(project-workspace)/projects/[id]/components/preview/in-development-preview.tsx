'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { InDevelopmentPreviewProps } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FileText, Gamepad2 } from 'lucide-react';
import RequirementsEditor from '../requirements/requirements-editor';
import SlotMachine from '../requirements/slot-machine';

/**
 * Preview component for in_development status
 * Shows toggle between slot machine game and requirements docs
 */
export default function InDevelopmentPreview({
  content,
  viewMode,
  onViewModeChange,
  className,
}: InDevelopmentPreviewProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header with toggle */}
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Badge>In Development</Badge>
          <span className="text-sm text-muted-foreground">Your project is being built</span>
        </div>
        <TooltipProvider>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'game' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onViewModeChange('game')}
                >
                  <Gamepad2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Play while waiting</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'docs' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onViewModeChange('docs')}
                >
                  <FileText className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View requirements</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'game' ? (
          <div className="flex h-full items-center justify-center p-4">
            <SlotMachine />
          </div>
        ) : (
          <ScrollArea className="h-full">
            {content ? (
              <RequirementsEditor initialContent={content} editable={false} className="h-full" />
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-muted-foreground">
                No requirements document available
              </div>
            )}
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
