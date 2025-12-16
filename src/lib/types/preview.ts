// Preview Panel and Project Preview Types

// Preview Status Types
export type PreviewStatus = 'loading' | 'ready' | 'error';

// Health endpoint response - used by both frontend and backend
export interface PreviewHealthResponse {
  ok: boolean;
  running: boolean;
  isResponding: boolean;
  url: string | null;
}

// Preview endpoint response - starts/returns preview URL
export interface StartPreviewResponse {
  success: boolean;
  previewUrl: string;
  projectId: string;
  sessionId: string;
}

// Preview Panel Hook Types
export interface UsePreviewPanelOptions {
  projectId: string;
  sessionId: string;
  projectName: string;
  enabled?: boolean;
  /** When true, shows template preview immediately while container starts in background */
  isNewProject?: boolean;
}

export interface UsePreviewPanelReturn {
  // State
  status: PreviewStatus;
  progress: number;
  previewUrl: string | null;
  error: string | null;
  iframeKey: number;
  isDownloading: boolean;
  isStarting: boolean;
  /** True when showing the template preview instead of actual project preview */
  isShowingTemplate: boolean;

  // Actions
  handleRefresh: (forceStart?: boolean) => Promise<void>;
  openInNewTab: () => void;
  handleDownloadZip: () => Promise<void>;
  handleTryAgain: () => Promise<void>;

  // Status helpers
  getStatusMessage: () => string;
  getStatusIconType: () => 'ready' | 'error' | 'loading';
}
