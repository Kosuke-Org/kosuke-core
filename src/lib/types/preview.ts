// Preview Panel and Project Preview Types

// Preview Status Types
export type PreviewStatus = 'loading' | 'ready' | 'error';

export interface StartPreviewResponse {
  success: boolean;
  url?: string;
  previewUrl?: string;
  error?: string;
  project_id?: string;
  session_id?: string;
  running?: boolean;
  is_responding?: boolean;
}

// Preview Panel Hook Types
export interface UsePreviewPanelOptions {
  projectId: string;
  sessionId: string;
  projectName: string;
  enabled?: boolean;
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

  // Actions
  handleRefresh: (forceStart?: boolean) => Promise<void>;
  openInNewTab: () => void;
  handleDownloadZip: () => Promise<void>;
  handleTryAgain: () => Promise<void>;

  // Status helpers
  getStatusMessage: () => string;
  getStatusIconType: () => 'ready' | 'error' | 'loading';
}
