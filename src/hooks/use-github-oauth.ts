import type { ApiResponse } from '@/lib/api';
import type { GitHubConnectionStatus } from '@/app/api/auth/github/status/route';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

const GITHUB_CONNECTING_KEY = 'github_oauth_connecting';
const CONNECTION_TIMEOUT = 2 * 60 * 1000;

// Helper functions for storage
const setConnectingStorage = () => {
  sessionStorage.setItem(GITHUB_CONNECTING_KEY, Date.now().toString());
};

const getConnectingStorage = (): number | null => {
  const timestamp = sessionStorage.getItem(GITHUB_CONNECTING_KEY);
  return timestamp ? parseInt(timestamp, 10) : null;
};

const clearConnectingStorage = () => {
  sessionStorage.removeItem(GITHUB_CONNECTING_KEY);
};

/**
 * Hook for managing GitHub App OAuth connection.
 * Uses the GitHub App's user authorization flow instead of Clerk OAuth.
 */
export function useGitHubOAuth() {
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Fetch GitHub connection status from API
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['github-connection-status'],
    queryFn: async (): Promise<GitHubConnectionStatus> => {
      const response = await fetch('/api/auth/github/status');
      if (!response.ok) {
        throw new Error('Failed to fetch GitHub status');
      }
      const result: ApiResponse<GitHubConnectionStatus> = await response.json();
      return result.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
    refetchOnMount: 'always', // Always refetch when component mounts to ensure fresh data
  });

  const isConnected = data?.isConnected ?? false;
  const githubAccount = data?.isConnected
    ? {
        username: data.username,
        avatarUrl: data.avatarUrl,
      }
    : null;

  // Check sessionStorage on mount for persisted connecting state
  useEffect(() => {
    const timestamp = getConnectingStorage();

    if (timestamp) {
      const elapsed = Date.now() - timestamp;

      if (elapsed > CONNECTION_TIMEOUT) {
        clearConnectingStorage();
        setIsConnecting(false);
      } else {
        setIsConnecting(true);
      }
    }
  }, []);

  /**
   * Initiates the GitHub App OAuth flow.
   * Redirects to GitHub for authorization.
   */
  const connectGitHub = useCallback((redirectUrl?: string) => {
    setIsConnecting(true);
    setConnectingStorage();

    const finalRedirectUrl = redirectUrl || `${window.location.pathname}`;

    // Redirect to our connect endpoint which handles the OAuth flow
    window.location.href = `/api/auth/github/connect?redirect=${encodeURIComponent(finalRedirectUrl)}`;
  }, []);

  /**
   * Disconnects the user's GitHub account.
   */
  const disconnectGitHub = useCallback(async () => {
    setIsDisconnecting(true);
    try {
      const response = await fetch('/api/auth/github/disconnect', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect GitHub');
      }

      // Invalidate the status query to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ['github-connection-status'] });
      // Also invalidate repositories query
      await queryClient.invalidateQueries({ queryKey: ['github-repos-with-status'] });
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error);
      throw error;
    } finally {
      setIsDisconnecting(false);
    }
  }, [queryClient]);

  /**
   * Clears the connecting state (e.g., after successful connection).
   */
  const clearConnectingState = useCallback(() => {
    clearConnectingStorage();
    setIsConnecting(false);
    // Refetch status after clearing connecting state
    refetch();
  }, [refetch]);

  return {
    isConnected,
    isConnecting,
    isDisconnecting,
    isLoading,
    connectGitHub,
    disconnectGitHub,
    clearConnectingState,
    githubAccount,
    refetch,
  };
}
