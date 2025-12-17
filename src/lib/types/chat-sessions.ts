// Chat session types for multi-session architecture
import type { ChatMessage } from './chat';

export interface ChatSession {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  description?: string;
  branchName: string;
  status: 'active' | 'archived' | 'completed';
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  messageCount: number;
  isDefault: boolean;
  // GitHub PR/merge status
  branchMergedAt?: string;
  branchMergedBy?: string;
  mergeCommitSha?: string;
  pullRequestNumber?: number;
}

export interface CreateChatSessionData {
  title: string;
  description?: string;
}

export interface UpdateChatSessionData {
  title?: string;
  description?: string;
  status?: 'active' | 'archived' | 'completed';
}

export interface ChatSessionListResponse {
  sessions: ChatSession[];
  total: number;
}

export interface ChatSessionMessagesResponse {
  messages: ChatMessage[];
  sessionInfo: {
    id: string;
    branchName: string;
    title: string;
    status: string;
    messageCount: number;
  };
}

// Pull Request types
export interface CreatePullRequestData {
  title?: string;
  description?: string;
  target_branch?: string;
}

export interface CreatePullRequestResponse {
  pull_request_url: string;
  title: string;
  source_branch: string;
  target_branch: string;
  success: boolean;
}

// Chat Session Status Type
export type ChatSessionStatus = 'active' | 'archived' | 'completed';

// Chat Sidebar Hook Types
export interface UseChatSidebarOptions {
  projectId: string;
  onChatSessionChange: (sessionId: string) => void;
}

export interface UseChatSidebarReturn {
  // State
  filteredSessions: ChatSession[];
  statusFilter: ChatSessionStatus[];
  isNewChatModalOpen: boolean;
  editingSession: ChatSession | null;
  deletingSession: ChatSession | null;
  newChatTitle: string;

  // Actions
  setIsNewChatModalOpen: (open: boolean) => void;
  setEditingSession: (session: ChatSession | null) => void;
  setDeletingSession: (session: ChatSession | null) => void;
  setNewChatTitle: (title: string) => void;
  setStatusFilter: (statuses: ChatSessionStatus[]) => void;
  handleCreateChat: () => Promise<void>;
  handleUpdateSession: (session: ChatSession, updates: Partial<ChatSession>) => Promise<void>;
  handleDeleteSession: (session: ChatSession) => void;
  confirmDeleteSession: (session: ChatSession) => Promise<void>;
  handleDuplicateSession: (session: ChatSession) => Promise<void>;
  handleViewGitHubBranch: (session: ChatSession) => void;

  // Utilities
  formatRelativeTime: (dateString: string) => string;

  // Loading states
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}
