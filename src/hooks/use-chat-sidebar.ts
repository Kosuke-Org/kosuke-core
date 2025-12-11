import { useCallback, useState } from 'react';

import {
  useChatSessions,
  useCreateChatSession,
  useDeleteChatSession,
  useUpdateChatSession,
} from '@/hooks/use-chat-sessions';
import type { ChatSession, UseChatSidebarOptions, UseChatSidebarReturn } from '@/lib/types';

export function useChatSidebar({
  projectId,
  onChatSessionChange,
}: UseChatSidebarOptions): UseChatSidebarReturn {
  // State
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<ChatSession | null>(null);
  const [newChatTitle, setNewChatTitle] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Hooks
  const { data: sessions = [] } = useChatSessions(projectId);
  const createChatSession = useCreateChatSession(projectId);
  const updateChatSession = useUpdateChatSession(projectId);
  const deleteChatSession = useDeleteChatSession(projectId);

  // Separate sessions by status
  const activeSessions = sessions.filter(s => s.status === 'active');
  const archivedSessions = sessions.filter(s => s.status === 'archived');

  // Format relative time
  const formatRelativeTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;
    return date.toLocaleDateString();
  }, []);

  // Handle new chat creation
  const handleCreateChat = useCallback(async () => {
    if (!newChatTitle.trim()) return;

    try {
      const newSession = await createChatSession.mutateAsync({
        title: newChatTitle.trim(),
      });

      // Trigger session container creation immediately
      console.log(
        `[Chat Sidebar] Creating container for new session: ${newSession.session.sessionId}`
      );

      // Use a simple fetch call to trigger container creation without waiting for response
      // This allows the user to continue while the container starts in the background
      fetch(`/api/projects/${projectId}/chat-sessions/${newSession.session.sessionId}/preview`, {
        method: 'GET',
      }).catch(error => {
        console.warn(
          `[Chat Sidebar] Failed to start container for session ${newSession.session.sessionId}:`,
          error
        );
        // Don't throw error - container creation failure shouldn't prevent session creation
      });

      // Reset form and close modal
      setNewChatTitle('');
      setIsNewChatModalOpen(false);

      // Redirect/select the newly created session in parent (updates URL ?session=...)
      if (onChatSessionChange) {
        onChatSessionChange(newSession.session.id);
      }
    } catch (error) {
      console.error('[Chat Sidebar] Failed to create chat session:', error);
      // Error is already handled by the mutation hook
    }
  }, [newChatTitle, createChatSession, projectId, onChatSessionChange]);

  // Handle session update
  const handleUpdateSession = useCallback(
    async (session: ChatSession, updates: Partial<ChatSession>) => {
      await updateChatSession.mutateAsync({
        sessionId: session.sessionId,
        data: updates,
      });
      setEditingSession(null);
    },
    [updateChatSession]
  );

  // Handle session deletion
  const handleDeleteSession = useCallback(
    async (session: ChatSession) => {
      if (session.isDefault) return; // Prevent deletion of default session

      const confirmed = window.confirm(
        `Are you sure you want to delete "${session.title}"? This action cannot be undone.`
      );

      if (confirmed) {
        await deleteChatSession.mutateAsync(session.sessionId);
      }
    },
    [deleteChatSession]
  );

  // Handle session duplication
  const handleDuplicateSession = useCallback(
    async (session: ChatSession) => {
      await createChatSession.mutateAsync({
        title: `${session.title} (Copy)`,
        description: session.description,
      });
    },
    [createChatSession]
  );

  // Handle view GitHub branch
  const handleViewGitHubBranch = useCallback((session: ChatSession) => {
    // Placeholder implementation using sessionId as branch name
    const githubUrl = `https://github.com/owner/repo/tree/${session.sessionId}`;
    window.open(githubUrl, '_blank');
  }, []);

  return {
    // State
    sessions,
    activeSessions,
    archivedSessions,
    isNewChatModalOpen,
    editingSession,
    newChatTitle,
    showArchived,

    // Actions
    setIsNewChatModalOpen,
    setEditingSession,
    setNewChatTitle,
    setShowArchived,
    handleCreateChat,
    handleUpdateSession,
    handleDeleteSession,
    handleDuplicateSession,
    handleViewGitHubBranch,

    // Utilities
    formatRelativeTime,

    // Loading states
    isCreating: createChatSession.isPending,
    isUpdating: updateChatSession.isPending,
    isDeleting: deleteChatSession.isPending,
  };
}
