'use client';

import {
  CheckCircle,
  Download,
  ExternalLink,
  Github,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePreviewPanel } from '@/hooks/use-preview-panel';
import { cn } from '@/lib/utils';
import DownloadingModal from './downloading-modal';

import type { RequirementsViewMode } from '@/lib/types';

interface PreviewPanelProps {
  projectId: string;
  projectName: string;
  sessionId: string;
  branch?: string;
  className?: string;
  /** When true, shows template preview immediately while container starts */
  isNewProject?: boolean;
  /** When true, shows the expand sidebar button */
  isSidebarCollapsed?: boolean;
  /** Callback to toggle sidebar visibility */
  onToggleSidebar?: () => void;
  /** When true, shows the Create PR button */
  showCreatePR?: boolean;
  /** Callback to create a pull request */
  onCreatePullRequest?: () => void;
  /** When true, the Create PR button is enabled (requires completed build) */
  canCreatePR?: boolean;
  /** When true, the Create PR mutation is in progress */
  isCreatingPR?: boolean;
  /** URL of the created PR (when available, shows View PR button) */
  prUrl?: string | null;
  // Requirements mode props
  /** Project status for status-based preview content */
  projectStatus?: 'requirements' | 'requirements_ready' | 'in_development' | 'active';
  /** Markdown content for requirements preview */
  requirementsContent?: string;
  /** Current view mode for in_development status (game or docs) */
  viewMode?: RequirementsViewMode;
  /** Callback when view mode changes */
  onViewModeChange?: (mode: RequirementsViewMode) => void;
  /** Callback to confirm requirements (for RequirementsPreview) */
  onConfirmRequirements?: () => void;
  /** When true, the confirm requirements button is enabled */
  canConfirmRequirements?: boolean;
  /** When true, the confirm requirements mutation is in progress */
  isConfirmingRequirements?: boolean;
}

// Import requirements preview components
import InDevelopmentPreview from './in-development-preview';
import RequirementsPreview from './requirements-preview';
import RequirementsReadyPreview from './requirements-ready-preview';

export default function PreviewPanel({
  projectId,
  projectName,
  sessionId,
  branch,
  className,
  isNewProject = false,
  isSidebarCollapsed = false,
  onToggleSidebar,
  showCreatePR = false,
  onCreatePullRequest,
  canCreatePR = false,
  isCreatingPR = false,
  prUrl = null,
  // Requirements mode props
  projectStatus = 'active',
  requirementsContent,
  viewMode = 'game',
  onViewModeChange,
  // Confirm requirements props
  onConfirmRequirements,
  canConfirmRequirements = false,
  isConfirmingRequirements = false,
}: PreviewPanelProps) {
  const {
    // State
    status,
    progress,
    previewUrl,
    iframeKey,
    isDownloading,
    isStarting,
    isShowingTemplate,
    // Actions
    handleRefresh,
    openInNewTab,
    handleDownloadZip,
    handleTryAgain,
    // Status helpers
    getStatusMessage,
    getStatusIconType,
  } = usePreviewPanel({ projectId, sessionId, projectName, isNewProject });
  const isPreviewEnabled = Boolean(sessionId);

  // Check if we're in requirements mode
  const isRequirementsMode =
    projectStatus === 'requirements' ||
    projectStatus === 'requirements_ready' ||
    projectStatus === 'in_development';

  // Render requirements-specific preview content based on status
  const renderRequirementsContent = () => {
    switch (projectStatus) {
      case 'requirements':
        return (
          <RequirementsPreview
            content={requirementsContent}
            onToggleSidebar={onToggleSidebar}
            isSidebarCollapsed={isSidebarCollapsed}
            onConfirmRequirements={onConfirmRequirements}
            canConfirm={canConfirmRequirements}
            isConfirming={isConfirmingRequirements}
          />
        );
      case 'requirements_ready':
        return <RequirementsReadyPreview content={requirementsContent} projectName={projectName} />;
      case 'in_development':
        return (
          <InDevelopmentPreview
            content={requirementsContent}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange || (() => {})}
          />
        );
      default:
        return null;
    }
  };

  // Render status icon based on status type
  const renderStatusIcon = () => {
    const iconType = getStatusIconType();
    switch (iconType) {
      case 'ready':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'error':
        return <XCircle className="h-6 w-6 text-red-500" />;
      default:
        return <Loader2 className="h-6 w-6 text-primary animate-spin" />;
    }
  };

  return (
    <div
      className={cn('flex flex-col h-full w-full overflow-hidden', className)}
      data-testid="preview-panel"
    >
      {/* Header - only show development actions when not in requirements mode */}
      {!isRequirementsMode && (
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-2">
            {/* Toggle sidebar button */}
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
                  <Github className="mr-2 h-4 w-4" />
                  <span>Create GitHub Repo</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="flex items-center"
                  onClick={handleDownloadZip}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={openInNewTab}
                    aria-label="Open in new tab"
                  >
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
                  onClick={() => handleRefresh()}
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
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <div className="h-full w-full">
          {/* Requirements mode content */}
          {isRequirementsMode ? (
            renderRequirementsContent()
          ) : /* Development mode content */
          !isPreviewEnabled || status !== 'ready' ? (
            <div className="flex h-full items-center justify-center flex-col p-6">
              {isPreviewEnabled ? (
                renderStatusIcon()
              ) : (
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              )}
              <span className="text-sm font-medium mt-4 mb-2">
                {isPreviewEnabled ? getStatusMessage() : 'Loading session...'}
              </span>
              {status === 'loading' && (
                <Progress value={progress} className="h-1.5 w-full max-w-xs mt-2" />
              )}
              {status === 'error' && (
                <button
                  onClick={handleTryAgain}
                  className="mt-4 text-primary hover:underline disabled:opacity-50"
                  disabled={!isPreviewEnabled || isStarting}
                  data-testid="try-again-button"
                >
                  {isStarting ? 'Starting...' : 'Try again'}
                </button>
              )}
            </div>
          ) : previewUrl ? (
            <iframe
              key={iframeKey}
              src={previewUrl}
              className="h-full w-full border-0"
              title={`Preview of ${projectName}`}
              sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-downloads"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-4">
              <p className="mb-4 text-center text-muted-foreground">
                No preview available yet. Click the refresh button to generate a preview.
              </p>
              <button
                onClick={() => handleRefresh(true)}
                className="text-primary hover:underline"
                data-testid="generate-preview-button"
              >
                Generate Preview
              </button>
            </div>
          )}
        </div>
      </div>
      <DownloadingModal open={isDownloading} />
    </div>
  );
}
