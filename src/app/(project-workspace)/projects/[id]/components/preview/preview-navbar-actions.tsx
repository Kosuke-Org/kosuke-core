'use client';

import { Download, ExternalLink, GitFork, Loader2, RefreshCw, Send } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PreviewNavbarActionsProps {
  status: 'idle' | 'loading' | 'ready' | 'error';
  previewUrl: string | null;
  isPreviewEnabled: boolean;
  isDownloading: boolean;
  onRefresh: () => void;
  onOpenInNewTab: () => void;
  onDownloadZip: () => void;
  showCreatePR?: boolean;
  onCreatePullRequest?: () => void;
  canCreatePR?: boolean;
  isCreatingPR?: boolean;
  prUrl?: string | null;
}

export function PreviewNavbarActions({
  status,
  previewUrl,
  isPreviewEnabled,
  isDownloading,
  onRefresh,
  onOpenInNewTab,
  onDownloadZip,
  showCreatePR = false,
  onCreatePullRequest,
  canCreatePR = false,
  isCreatingPR = false,
  prUrl = null,
}: PreviewNavbarActionsProps) {
  return (
    <div className="flex items-center space-x-1">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Download project"
                disabled={isDownloading}
              >
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Download</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="flex items-center" disabled>
            <GitFork className="mr-2 h-4 w-4" />
            <span>Create GitHub Repo</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center"
            onClick={onDownloadZip}
            disabled={isDownloading}
          >
            <Download className="mr-2 h-4 w-4" />
            <span>Download ZIP</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {previewUrl && status === 'ready' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onOpenInNewTab} aria-label="Open in new tab">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>View</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={!isPreviewEnabled || status === 'loading'}
            aria-label="Refresh preview"
          >
            <RefreshCw className={cn('h-4 w-4', status === 'loading' && 'animate-spin')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh</TooltipContent>
      </Tooltip>

      {showCreatePR && prUrl ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" asChild>
              <Link href={prUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                View Changes
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>View your submitted changes on GitHub</TooltipContent>
        </Tooltip>
      ) : showCreatePR && onCreatePullRequest ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="outline"
                size="sm"
                onClick={onCreatePullRequest}
                disabled={!canCreatePR || isCreatingPR}
              >
                {isCreatingPR ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                {isCreatingPR ? 'Creating...' : 'Submit'}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {!canCreatePR
              ? 'A successful build is required before submitting'
              : 'Submit your changes'}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
