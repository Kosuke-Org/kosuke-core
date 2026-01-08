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
import { useEffect, useRef } from 'react';

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

type SubmitStatus =
  | 'pending'
  | 'reviewing'
  | 'committing'
  | 'creating_pr'
  | 'done'
  | 'failed'
  | null;

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
  /** When true, shows the Submit button */
  showSubmit?: boolean;
  /** Callback to submit the build */
  onSubmit?: () => void;
  /** When true, the Submit button is enabled (requires completed build) */
  canSubmit?: boolean;
  /** Current submit status from build job */
  submitStatus?: SubmitStatus;
  /** URL of the created PR (when available, shows View Changes button) */
  prUrl?: string | null;
  /** When true, submit mutation is in progress (disables button immediately) */
  isSubmitting?: boolean;
  /** When true, submit mutation succeeded but status hasn't updated yet */
  hasSubmitted?: boolean;
  // Requirements mode props
  /** Project status for status-based preview content */
  projectStatus?:
    | 'requirements'
    | 'requirements_ready'
    | 'environments_ready'
    | 'waiting_for_payment'
    | 'paid'
    | 'in_development'
    | 'active';
  /** Stripe invoice URL for waiting_for_payment status */
  stripeInvoiceUrl?: string | null;
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
  /** Callback to confirm environment (for EnvironmentsPreview) */
  onConfirmEnvironment?: () => void;
  /** When true, the confirm environment mutation is in progress */
  isConfirmingEnvironment?: boolean;
}

/**
 * Get button label based on submit status
 */
function getSubmitButtonLabel(
  submitStatus: SubmitStatus,
  isSubmitting: boolean,
  hasSubmitted: boolean
): string {
  // Show "Preparing..." during mutation or while waiting for status to update
  if (isSubmitting || (hasSubmitted && !submitStatus)) return 'Preparing...';
  switch (submitStatus) {
    case 'pending':
      return 'Preparing...';
    case 'reviewing':
      return 'Reviewing...';
    case 'committing':
    case 'creating_pr':
      return 'Cleaning up...';
    default:
      return 'Submit';
  }
}

/**
 * Check if submit is in progress (any status that means work is happening)
 */
function isSubmitInProgress(submitStatus: SubmitStatus): boolean {
  return (
    submitStatus === 'pending' ||
    submitStatus === 'reviewing' ||
    submitStatus === 'committing' ||
    submitStatus === 'creating_pr'
  );
}

// Import requirements preview components
import EnvironmentsPreview from './environments-preview';
import InDevelopmentPreview from './in-development-preview';
import RequirementsPreview from './requirements-preview';
import WaitingForPaymentPreview from './waiting-for-payment-preview';

// We use it in the template preview iframe to redirect to a specific url (e.g. after Stripe callback urls)
const IFRAME_REDIRECT_URL_PARAM = 'iframeRedirectUrl';

export default function PreviewPanel({
  projectId,
  projectName,
  sessionId,
  branch,
  className,
  isNewProject = false,
  isSidebarCollapsed = false,
  onToggleSidebar,
  showSubmit = false,
  onSubmit,
  canSubmit = false,
  submitStatus = null,
  prUrl = null,
  isSubmitting = false,
  hasSubmitted = false,
  // Requirements mode props
  projectStatus = 'active',
  stripeInvoiceUrl,
  requirementsContent,
  viewMode = 'game',
  onViewModeChange,
  // Confirm requirements props
  onConfirmRequirements,
  canConfirmRequirements = false,
  isConfirmingRequirements = false,
  // Confirm environment props
  onConfirmEnvironment,
  isConfirmingEnvironment = false,
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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for messages from the embedded iframe requesting the parent URL
  // We need to get the parent URL to redirect back after Stripe Checkout
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only process messages from the iframe's origin
      if (!previewUrl) return;

      try {
        const iframeOrigin = new URL(previewUrl).origin;

        // Verify the message is from our preview iframe
        if (event.origin !== iframeOrigin) {
          console.log('Message not from preview iframe:', event.origin, iframeOrigin);
          return;
        }

        console.log('Message from preview iframe:', event.data);

        // Handle request for parent URL
        if (event.data && event.data.type === 'PARENT_URL' && !event.data.url) {
          const params = new URLSearchParams(window.location.search);
          const iframeRedirectUrl = params.get(IFRAME_REDIRECT_URL_PARAM);

          // Send back the parent URL and optional iframe redirect
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              {
                type: 'PARENT_URL',
                url: window.location.href, // Full URL with path
                ...(iframeRedirectUrl && { iframeRedirectUrl }),
              },
              iframeOrigin // Send to specific origin for security
            );
          }

          if (iframeRedirectUrl) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete(IFRAME_REDIRECT_URL_PARAM);
            window.history.replaceState({}, '', newUrl.toString());
          }
        }
      } catch (error) {
        // Invalid URL or other error - ignore
        console.error('Error handling iframe message:', error);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [previewUrl]);

  // Check if we're in requirements mode (B2C flow statuses)
  const isRequirementsMode =
    projectStatus === 'requirements' ||
    projectStatus === 'requirements_ready' ||
    projectStatus === 'environments_ready' ||
    projectStatus === 'waiting_for_payment' ||
    projectStatus === 'paid' ||
    projectStatus === 'in_development';

  // Render requirements-specific preview content based on status
  const renderRequirementsContent = () => {
    switch (projectStatus) {
      case 'requirements':
        return (
          <RequirementsPreview
            projectId={projectId}
            content={requirementsContent}
            onToggleSidebar={onToggleSidebar}
            isSidebarCollapsed={isSidebarCollapsed}
            onConfirmRequirements={onConfirmRequirements}
            canConfirm={canConfirmRequirements}
            isConfirming={isConfirmingRequirements}
          />
        );
      case 'requirements_ready':
        // Show environment variables preview with toggle to view requirements
        return (
          <EnvironmentsPreview
            projectId={projectId}
            onToggleSidebar={onToggleSidebar}
            isSidebarCollapsed={isSidebarCollapsed}
            onConfirmEnvironment={onConfirmEnvironment}
            isConfirming={isConfirmingEnvironment}
            requirementsContent={requirementsContent}
          />
        );
      case 'waiting_for_payment':
        return (
          <WaitingForPaymentPreview
            stripeInvoiceUrl={stripeInvoiceUrl}
            onToggleSidebar={onToggleSidebar}
            isSidebarCollapsed={isSidebarCollapsed}
          />
        );
      case 'environments_ready':
      case 'paid':
      case 'in_development':
        // These statuses show the game/docs toggle view with dynamic badges
        return (
          <InDevelopmentPreview
            content={requirementsContent}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange || (() => {})}
            projectStatus={projectStatus}
            onToggleSidebar={onToggleSidebar}
            isSidebarCollapsed={isSidebarCollapsed}
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
            {showSubmit && (submitStatus === 'done' || prUrl) ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={prUrl || '#'} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View Changes
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View your submitted changes on GitHub</TooltipContent>
              </Tooltip>
            ) : showSubmit && onSubmit ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onSubmit}
                      disabled={
                        !canSubmit ||
                        isSubmitting ||
                        hasSubmitted ||
                        isSubmitInProgress(submitStatus)
                      }
                    >
                      {canSubmit &&
                      (isSubmitting ||
                        (hasSubmitted && !submitStatus) ||
                        isSubmitInProgress(submitStatus)) ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      {canSubmit
                        ? getSubmitButtonLabel(submitStatus, isSubmitting, hasSubmitted)
                        : 'Submit'}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {!canSubmit
                    ? 'A successful build is required before submitting'
                    : isSubmitting || (hasSubmitted && !submitStatus) || submitStatus === 'pending'
                      ? 'Preparing submission...'
                      : submitStatus === 'reviewing'
                        ? 'Reviewing code quality...'
                        : submitStatus === 'committing' || submitStatus === 'creating_pr'
                          ? 'Finalizing changes...'
                          : submitStatus === 'failed'
                            ? 'Previous submit failed. Click to retry.'
                            : 'Submit your changes for review and create a pull request'}
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
              ref={iframeRef}
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
