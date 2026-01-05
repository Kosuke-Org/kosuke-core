'use client';

import { PreviewNavbarActions } from './preview-navbar-actions';
import { PreviewNavbarLeft } from './preview-navbar-left';

interface PreviewNavbarProps {
  // Left section props
  branch?: string;
  isShowingTemplate?: boolean;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  // Action buttons props
  status: 'idle' | 'loading' | 'ready' | 'error';
  previewUrl: string | null;
  isPreviewEnabled: boolean;
  isDownloading: boolean;
  onRefresh: () => void;
  onOpenInNewTab: () => void;
  onDownloadZip: () => void;
  // PR props
  showCreatePR?: boolean;
  onCreatePullRequest?: () => void;
  canCreatePR?: boolean;
  isCreatingPR?: boolean;
  prUrl?: string | null;
}

export function PreviewNavbar({
  branch,
  isShowingTemplate = false,
  isSidebarCollapsed = false,
  onToggleSidebar,
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
}: PreviewNavbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b">
      <PreviewNavbarLeft
        branch={branch}
        isShowingTemplate={isShowingTemplate}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
      />
      <PreviewNavbarActions
        status={status}
        previewUrl={previewUrl}
        isPreviewEnabled={isPreviewEnabled}
        isDownloading={isDownloading}
        onRefresh={onRefresh}
        onOpenInNewTab={onOpenInNewTab}
        onDownloadZip={onDownloadZip}
        showCreatePR={showCreatePR}
        onCreatePullRequest={onCreatePullRequest}
        canCreatePR={canCreatePR}
        isCreatingPR={isCreatingPR}
        prUrl={prUrl}
      />
    </div>
  );
}
