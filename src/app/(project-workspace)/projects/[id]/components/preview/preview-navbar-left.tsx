'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PreviewNavbarLeftProps {
  branch?: string;
  isShowingTemplate?: boolean;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function PreviewNavbarLeft({
  branch,
  isShowingTemplate = false,
  isSidebarCollapsed = false,
  onToggleSidebar,
}: PreviewNavbarLeftProps) {
  return (
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
      {isShowingTemplate ? (
        <Badge variant="outline" className="text-xs">
          Template
        </Badge>
      ) : (
        <Badge variant="secondary" className="text-xs">
          {branch}
        </Badge>
      )}
    </div>
  );
}
