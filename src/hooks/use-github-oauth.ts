import { useReverification, useUser } from '@clerk/nextjs';
import { isReverificationCancelledError } from '@clerk/nextjs/errors';
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

export function useGitHubOAuth() {
  const { user } = useUser();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Use verification.strategy for consistency - this matches the OAuth strategy used
  // Server-side uses provider === 'oauth_github', client uses strategy === 'oauth_github'
  const githubAccount = user?.externalAccounts?.find(
    account => account.verification?.strategy === 'oauth_github'
  );

  const isConnected = !!githubAccount;

  // Check sessionStorage on mount for persisted connecting state
  useEffect(() => {
    const timestamp = getConnectingStorage();

    if (timestamp) {
      const elapsed = Date.now() - timestamp;

      // Only clean up if timeout exceeded (NOT if connection completed)
      // We need to keep the connecting state until we manually clear it
      if (elapsed > CONNECTION_TIMEOUT) {
        clearConnectingStorage();
        setIsConnecting(false);
      } else {
        // Restore connecting state
        setIsConnecting(true);
      }
    }
  }, []);

  // Wrap createExternalAccount with reverification to handle stale sessions
  // This automatically prompts for re-authentication when needed
  const createExternalAccountWithReverification = useReverification(async (redirectUrl: string) => {
    if (!user) return null;

    const externalAccount = await user.createExternalAccount({
      strategy: 'oauth_github',
      redirectUrl,
    });

    return externalAccount;
  });

  const connectGitHub = useCallback(
    async (redirectUrl?: string) => {
      if (!user) return;

      setIsConnecting(true);

      // Persist connecting state with timestamp
      setConnectingStorage();

      try {
        const finalRedirectUrl =
          redirectUrl || `${window.location.origin}${window.location.pathname}`;

        const externalAccount = await createExternalAccountWithReverification(finalRedirectUrl);

        // User cancelled reverification
        if (!externalAccount) {
          clearConnectingStorage();
          setIsConnecting(false);
          return;
        }

        const verification = externalAccount.verification;
        if (verification?.externalVerificationRedirectURL) {
          window.location.href = verification.externalVerificationRedirectURL.toString();
        } else {
          // Just reload Clerk user data, UI will update automatically
          await user.reload();
          clearConnectingStorage();
          setIsConnecting(false);
        }
      } catch (error) {
        // Handle reverification cancellation gracefully
        if (isReverificationCancelledError(error)) {
          console.log('User cancelled reverification');
          clearConnectingStorage();
          setIsConnecting(false);
          return;
        }

        console.error('Failed to connect GitHub:', error);
        clearConnectingStorage();
        setIsConnecting(false);
        throw error;
      }
    },
    [user, createExternalAccountWithReverification]
  );

  const disconnectGitHub = useCallback(async () => {
    if (!user || !githubAccount?.id) return;

    setIsDisconnecting(true);
    try {
      const externalAccount = user.externalAccounts.find(acc => acc.id === githubAccount.id);
      if (externalAccount) {
        await externalAccount.destroy();
        await user.reload();
      }
    } catch (error) {
      console.error('Failed to disconnect GitHub:', error);
      throw error;
    } finally {
      setIsDisconnecting(false);
    }
  }, [user, githubAccount]);

  const clearConnectingState = useCallback(() => {
    clearConnectingStorage();
    setIsConnecting(false);
  }, []);

  return {
    isConnected,
    isConnecting,
    isDisconnecting,
    connectGitHub,
    disconnectGitHub,
    clearConnectingState,
    githubAccount,
  };
}
