// Chat session types for multi-session architecture
import type { ChatMessage } from './chat';

// Chat session mode - for human-in-the-loop support
export type ChatSessionMode = 'autonomous' | 'human_assisted';

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
  // Human-in-the-loop mode
  mode: ChatSessionMode;
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
    mode: ChatSessionMode;
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
  pull_request_number: number;
  title: string;
  source_branch: string;
  target_branch: string;
  success: boolean;
}

// Chat Session Status Type
export type ChatSessionStatus = 'active' | 'archived' | 'completed';

// Admin-specific chat session types
export interface AdminSessionDetail {
  id: string;
  projectId: string;
  projectName: string | null;
  projectGithubOwner: string | null;
  projectGithubRepoName: string | null;
  userId: string | null;
  title: string;
  description: string | null;
  branchName: string;
  status: string | null;
  mode: 'autonomous' | 'human_assisted';
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  messageCount: number | null;
  isDefault: boolean | null;
  branchMergedAt: string | null;
  branchMergedBy: string | null;
  mergeCommitSha: string | null;
  pullRequestNumber: number | null;
}

interface AdminMessage {
  id: string;
  projectId: string;
  chatSessionId: string;
  userId: string | null;
  role: ChatMessage['role'];
  content: string | null;
  blocks: ChatMessage['blocks'];
  modelType: string | null;
  timestamp: string;
  tokensInput: number | null;
  tokensOutput: number | null;
  contextTokens: number | null;
  commitSha: string | null;
  metadata: Record<string, unknown> | null;
  adminUserId: string | null;
  attachments: unknown[];
}

export interface AdminSessionMessagesResponse {
  messages: AdminMessage[];
  sessionInfo: {
    id: string;
    projectId: string;
    projectName: string | null;
    userId: string | null;
    title: string;
    branchName: string;
    status: string | null;
    mode: 'autonomous' | 'human_assisted';
    messageCount: number | null;
  };
}

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
  confirmDeleteSession: (session: ChatSession) => void;
  handleDuplicateSession: (session: ChatSession) => Promise<void>;
  handleViewGitHubBranch: (session: ChatSession) => void;

  // Utilities
  formatRelativeTime: (dateString: string) => string;

  // Loading states
  isCreating: boolean;
  isUpdating: boolean;
}

// Admin Chat Session Hook Types
export interface UseAdminChatSessionOptions {
  sessionId: string;
}

export interface UseAdminChatSessionReturn {
  // Session data
  session: AdminSessionDetail | undefined;
  isLoadingSession: boolean;

  // Messages data
  messages: AdminSessionMessagesResponse['messages'];
  isLoadingMessages: boolean;

  // Mutations
  sendMessage: (content: string, attachments?: File[]) => void;
  isSendingMessage: boolean;

  toggleMode: (mode: 'autonomous' | 'human_assisted') => void;
  isTogglingMode: boolean;
}
