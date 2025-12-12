import { useCallback, useEffect, useRef, useState } from 'react';

import { useToast } from '@/hooks/use-toast';
import type {
  PreviewHealthResponse,
  PreviewStatus,
  UsePreviewPanelOptions,
  UsePreviewPanelReturn,
} from '@/lib/types';
import { useStartPreview } from './use-start-preview';

// Template preview URL from environment
const TEMPLATE_PREVIEW_URL = process.env.NEXT_PUBLIC_TEMPLATE_PREVIEW_URL;

export function usePreviewPanel({
  projectId,
  sessionId,
  projectName,
  enabled = true,
  isNewProject = false,
}: UsePreviewPanelOptions): UsePreviewPanelReturn {
  const { toast } = useToast();

  // Initialize hooks - sessionId is required
  const { mutateAsync: startPreview, isPending: isStarting } = useStartPreview(
    projectId,
    sessionId
  );

  // State
  const [status, setStatus] = useState<PreviewStatus>('loading');
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isShowingTemplate, setIsShowingTemplate] = useState(false);
  const requestInFlightRef = useRef(false);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup polling timeout on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }
    };
  }, []);

  // Check if the preview server is ready using session-scoped health check
  // This checks the container health within the Docker network
  const checkServerHealth = useCallback(async (): Promise<boolean> => {
    try {
      const healthUrl = `/api/projects/${projectId}/chat-sessions/${sessionId}/preview/health`;
      const response = await fetch(healthUrl, { method: 'GET' });
      if (!response.ok) return false;
      const data: PreviewHealthResponse = await response.json();
      return data.ok;
    } catch (error) {
      if (Math.random() < 0.2) {
        console.log(
          '[Preview Panel] Health check failed (sample):',
          error instanceof Error ? error.message : 'Connection failed'
        );
      }
      return false;
    }
  }, [projectId, sessionId]);

  // Poll the server until it's ready
  const pollServerUntilReady = useCallback(
    async (maxAttempts = 60) => {
      console.log(
        '[Preview Panel] Starting health check polling (waiting for HTTP 200; will wait 5s before first attempt)'
      );
      let attempts = 0;

      // Clear any existing polling timeout
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current);
        pollingTimeoutRef.current = null;
      }

      const poll = async () => {
        // Stop polling if component unmounted
        if (!isMountedRef.current) {
          console.log('[Preview Panel] Component unmounted, stopping poll');
          return;
        }

        if (attempts >= maxAttempts) {
          setError('Server failed to start after multiple attempts');
          setStatus('error');
          return;
        }

        attempts++;
        setProgress(Math.min(90, Math.floor((attempts / maxAttempts) * 100)));

        const isHealthy = await checkServerHealth();

        // Check again after async operation
        if (!isMountedRef.current) {
          console.log('[Preview Panel] Component unmounted after health check, stopping poll');
          return;
        }

        if (isHealthy) {
          console.log('[Preview Panel] Server is healthy');
          setStatus('ready');
          setProgress(100);
        } else {
          console.log(
            `[Preview Panel] Health check attempt ${attempts}/${maxAttempts} failed (non-200), retrying in 3s`
          );
          // Use longer delays for more patient polling
          const delay = attempts <= 3 ? 5000 : 3000; // 5s for first 3 attempts, then 3s
          pollingTimeoutRef.current = setTimeout(poll, delay);
        }
      };

      // Wait 5 seconds before starting health checks to give container time to start
      pollingTimeoutRef.current = setTimeout(poll, 5000);
    },
    [checkServerHealth]
  );

  // Ref to store fetchPreviewUrl function to avoid circular dependencies
  const fetchPreviewUrlRef = useRef<((forceStart?: boolean) => Promise<void>) | null>(null);

  // Fetch the preview URL
  const fetchPreviewUrl = useCallback(
    async (forceStart: boolean = false) => {
      // Guard: require enabled and non-empty sessionId
      if (!enabled || !sessionId) {
        return;
      }
      // Prevent duplicate requests using a ref-based lock
      if (requestInFlightRef.current) {
        console.log(
          `[Preview Panel] Request already in progress for project ${projectId}, skipping`
        );
        return;
      }
      requestInFlightRef.current = true;
      setStatus('loading');
      setProgress(0);
      setError(null);
      // No git status in status/start flows

      try {
        console.log(
          `[Preview Panel] Fetching preview URL for project ${projectId} session ${sessionId}${forceStart ? ' (forcing refresh)' : ''}`
        );

        // Use the hook - GET auto-starts preview if not running
        const data = await startPreview();
        console.log(`[Preview Panel] Preview status response:`, data);

        if (data.previewUrl) {
          console.log('[Preview Panel] Setting preview URL:', data.previewUrl);
          setPreviewUrl(data.previewUrl);
          // Always poll health endpoint to confirm preview is ready
          console.log('[Preview Panel] Polling until preview is ready');
          pollServerUntilReady();
        } else {
          throw new Error('No preview URL returned');
        }
      } catch (error) {
        const sessionText = `session ${sessionId}`;
        console.error(
          `[Preview Panel] Error fetching preview for project ${projectId} ${sessionText}:`,
          error
        );
        setError(error instanceof Error ? error.message : 'Failed to load preview');
        setStatus('error');
      } finally {
        requestInFlightRef.current = false;
      }
    },
    [enabled, sessionId, projectId, startPreview, pollServerUntilReady]
  );

  // Update ref when fetchPreviewUrl changes
  useEffect(() => {
    fetchPreviewUrlRef.current = fetchPreviewUrl;
  }, [fetchPreviewUrl]);

  // Fetch the preview URL on component mount and when session changes
  useEffect(() => {
    if (!enabled || !sessionId) return;
    const sessionText = `session ${sessionId}`;
    console.log(`[Preview Panel] Initializing preview for project ${projectId} ${sessionText}`);

    // For new projects, show template immediately while container starts in background
    if (isNewProject && TEMPLATE_PREVIEW_URL) {
      console.log('[Preview Panel] New project - showing template preview immediately');
      setPreviewUrl(TEMPLATE_PREVIEW_URL);
      setStatus('ready');
      setProgress(100);
      setIsShowingTemplate(true);

      // Start the actual preview container in background (fire and forget)
      startPreview().catch(error => {
        console.log('[Preview Panel] Background preview start failed:', error);
        // Don't update state - template is still showing
      });
      return;
    }

    // Normal flow: fetch and poll
    fetchPreviewUrlRef.current?.();
  }, [projectId, sessionId, enabled, isNewProject, startPreview]);

  // Function to refresh the preview
  const handleRefresh = useCallback(
    async (forceStart: boolean = false) => {
      console.log(
        `[Preview Panel] Manually refreshing preview${forceStart ? ' (forcing start)' : ''}`
      );
      // When refreshing, switch from template to actual preview
      if (isShowingTemplate) {
        console.log('[Preview Panel] Switching from template to actual preview');
        setIsShowingTemplate(false);
      }
      setIframeKey(prev => prev + 1);
      fetchPreviewUrl(forceStart);
    },
    [fetchPreviewUrl, isShowingTemplate]
  );

  // Listen for custom refresh events from the chat interface (real-time via streaming)
  useEffect(() => {
    console.log('[Preview Panel] Setting up refresh event listener for real-time updates');

    const handleRefreshPreview = (event: CustomEvent) => {
      const eventSessionId = event.detail.sessionId;
      const isCurrentSession = eventSessionId === sessionId;
      if (event.detail.projectId === projectId && isCurrentSession) {
        const sessionText = `session ${sessionId}`;
        console.log(
          `[Preview Panel] Received refresh event from chat streaming for ${sessionText}`
        );
        fetchPreviewUrlRef.current?.();
      }
    };

    // Listen for refresh events dispatched by the chat interface SSE
    window.addEventListener('refresh-preview', handleRefreshPreview as EventListener);

    return () => {
      console.log('[Preview Panel] Cleaning up refresh event listener');
      window.removeEventListener('refresh-preview', handleRefreshPreview as EventListener);
    };
  }, [projectId, sessionId]); // Depend on both projectId and sessionId

  // Heartbeat: periodically ping health endpoint to keep session alive (for cleanup job)
  // This runs every 60s when preview is ready to update lastActivityAt
  useEffect(() => {
    if (!enabled || !sessionId || status !== 'ready') return;

    const HEARTBEAT_INTERVAL =
      parseInt(process.env.NEXT_PUBLIC_PREVIEW_HEARTBEAT_INTERVAL_SEC!, 10) * 1000;

    const heartbeat = async () => {
      try {
        const healthUrl = `/api/projects/${projectId}/chat-sessions/${sessionId}/preview/health`;
        await fetch(healthUrl, { method: 'GET' });
      } catch {}
    };

    console.log(`[Preview Panel] Starting heartbeat for session ${sessionId}`);
    const intervalId = setInterval(heartbeat, HEARTBEAT_INTERVAL);

    return () => {
      console.log(`[Preview Panel] Stopping heartbeat for session ${sessionId}`);
      clearInterval(intervalId);
    };
  }, [enabled, sessionId, projectId, status]);

  // Function to open the preview in a new tab
  const openInNewTab = useCallback(() => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  }, [previewUrl]);

  // Download ZIP functionality
  const handleDownloadZip = useCallback(async () => {
    try {
      setIsDownloading(true);
      const response = await fetch(`/api/projects/${projectId}/download`);

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Failed to download project' }));
        throw new Error(errorData.error || 'Failed to download project');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading project:', error);
      toast({
        variant: 'destructive',
        title: 'Download Failed',
        description: error instanceof Error ? error.message : 'Failed to download project',
      });
    } finally {
      setIsDownloading(false);
    }
  }, [projectId, projectName, toast]);

  // Get the status message based on current status
  const getStatusMessage = useCallback(() => {
    switch (status) {
      case 'ready':
        return 'Preview is ready!';
      case 'loading':
        return 'Loading preview...';
      case 'error':
        return error || 'Error loading preview.';
    }
  }, [status, error]);

  // Get the status icon type based on current status
  const getStatusIconType = useCallback(() => {
    switch (status) {
      case 'ready':
        return 'ready';
      case 'error':
        return 'error';
      default:
        return 'loading';
    }
  }, [status]);

  // Handle try again functionality
  const handleTryAgain = useCallback(async () => {
    try {
      await startPreview();
      toast({
        title: 'Success',
        description: 'Preview is starting...',
      });
      // After starting, wait a moment then refresh to get the new URL
      setTimeout(() => {
        handleRefresh();
      }, 2000);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start preview',
      });
    }
  }, [startPreview, toast, handleRefresh]);

  return {
    // State
    status,
    progress,
    previewUrl,
    error,
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
  };
}
