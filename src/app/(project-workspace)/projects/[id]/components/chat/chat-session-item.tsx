'use client';

import {
  Calendar,
  Check,
  Copy,
  Edit,
  ExternalLink,
  GitBranch,
  MoreVertical,
  Trash2,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChatSession } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ChatSessionItemProps {
  session: ChatSession;
  isActive: boolean;
  onClick: () => void;
  onRename: (session: ChatSession) => void;
  onDuplicate: (session: ChatSession) => void | Promise<void>;
  onViewBranch: (session: ChatSession) => void;
  onToggleArchive: (session: ChatSession) => void | Promise<void>;
  onDelete: (session: ChatSession) => void | Promise<void>;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Get status badge props based on session status
 */
function getStatusBadgeProps(status: ChatSession['status']): {
  label: string;
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
  className: string;
  icon: React.ReactNode;
} {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        variant: 'default',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        icon: <GitBranch className="h-3 w-3" />,
      };
    case 'archived':
      return {
        label: 'Archived',
        variant: 'secondary',
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        icon: <XCircle className="h-3 w-3" />,
      };
    case 'completed':
      return {
        label: 'Completed',
        variant: 'secondary',
        className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        icon: <Check className="h-3 w-3" />,
      };
    default:
      return {
        label: status,
        variant: 'outline',
        className: '',
        icon: null,
      };
  }
}

export function ChatSessionItem({
  session,
  isActive,
  onClick,
  onRename,
  onDuplicate,
  onViewBranch,
  onToggleArchive,
  onDelete,
}: ChatSessionItemProps) {
  const statusBadge = getStatusBadgeProps(session.status);
  const isMerged = !!session.branchMergedAt;
  const isArchived = session.status === 'archived';
  const isCompleted = session.status === 'completed';

  const containerClass = cn(
    'group relative rounded-lg border p-3 cursor-pointer transition-colors',
    'hover:bg-accent/50',
    isActive ? 'bg-accent border-accent-foreground/20' : 'bg-background',
    (isArchived || isCompleted) && 'opacity-75 hover:opacity-100'
  );

  return (
    <div className={containerClass} onClick={onClick}>
      <div className="flex items-start justify-between pr-16">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Title */}
          <h3 className={cn('text-sm font-medium truncate pr-2', isActive && 'font-semibold')}>
            {session.title}
          </h3>

          {/* Branch Name */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono">{session.branchName}</span>
          </div>

          {/* Creation Date */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>Created {formatDate(session.createdAt)}</span>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <Badge
              variant={statusBadge.variant}
              className={cn('text-xs px-2 py-0 flex items-center gap-1', statusBadge.className)}
            >
              {statusBadge.icon}
              {statusBadge.label}
            </Badge>
            {session.pullRequestNumber && (
              <span className="text-xs text-muted-foreground">PR #{session.pullRequestNumber}</span>
            )}
          </div>
        </div>

        {/* Dropdown Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 absolute top-2 right-2"
              onClick={e => e.stopPropagation()}
              style={{ top: isMerged ? '32px' : '8px' }}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onRename(session)}>
              <Edit className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(session)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewBranch(session)}>
              <ExternalLink className="h-4 w-4 mr-2" />
              View on GitHub
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {!isCompleted && (
              <DropdownMenuItem onClick={() => onToggleArchive(session)}>
                {isArchived ? (
                  <>
                    <GitBranch className="h-4 w-4 mr-2" />
                    Unarchive
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />
                    Archive
                  </>
                )}
              </DropdownMenuItem>
            )}
            {!session.isDefault && (
              <DropdownMenuItem onClick={() => onDelete(session)} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
