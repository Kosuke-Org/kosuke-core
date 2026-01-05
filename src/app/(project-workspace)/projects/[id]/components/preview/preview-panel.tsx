'use client';

import { CheckCircle, Loader2, XCircle } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { usePreviewPanel } from '@/hooks/use-preview-panel';
import { cn } from '@/lib/utils';
import DownloadingModal from './downloading-modal';
import { PreviewNavbar } from './preview-navbar';

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
}

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
      <PreviewNavbar
        branch={branch}
        isShowingTemplate={isShowingTemplate}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
        status={status}
        previewUrl={previewUrl}
        isPreviewEnabled={isPreviewEnabled}
        isDownloading={isDownloading}
        onRefresh={() => handleRefresh()}
        onOpenInNewTab={openInNewTab}
        onDownloadZip={handleDownloadZip}
        showCreatePR={showCreatePR}
        onCreatePullRequest={onCreatePullRequest}
        canCreatePR={canCreatePR}
        isCreatingPR={isCreatingPR}
        prUrl={prUrl}
      />
      <div className="flex-1 overflow-hidden">
        <div className="h-full w-full">
          {!isPreviewEnabled || status !== 'ready' ? (
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
