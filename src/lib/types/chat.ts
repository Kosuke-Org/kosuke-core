// Tool Input Types
export type ToolInput = Record<string, unknown>;

// Assistant Response Block Types
export type AssistantBlock =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string; signature?: string }
  | {
      type: 'tool';
      name: string;
      input: ToolInput;
      result?: string;
      status: 'running' | 'completed' | 'error';
    };

// Core Chat Types
export interface ChatMessage {
  id: string;
  content?: string; // For user messages (optional for assistant messages)
  blocks?: AssistantBlock[]; // For assistant response blocks
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  tokensInput?: number;
  tokensOutput?: number;
  contextTokens?: number;
  commitSha?: string; // NEW: Git commit SHA for revert functionality
  hasError?: boolean;
  errorType?: ErrorType;
  attachments?: Attachment[];
  metadata?: {
    revertInfo?: { messageId: string; commitSha: string; timestamp: string };
    [key: string]: unknown;
  };
}

// Error Types
export type ErrorType = 'timeout' | 'parsing' | 'processing' | 'unknown';

// Message Options for Sending
export interface MessageOptions {
  includeContext?: boolean;
  contextFiles?: string[];
  attachments?: File[]; // Multiple file attachments (images and PDFs)
}

// API Response Types
export interface ApiChatMessage {
  id: string;
  projectId: string;
  userId: string | null;
  content?: string; // For user messages
  blocks?: AssistantBlock[]; // For assistant messages
  role: string;
  timestamp: string | Date;
  tokensInput?: number;
  tokensOutput?: number;
  contextTokens?: number;
  attachments?: Attachment[];
  metadata?: string;
}

// Component Props Types
export interface ChatMessageProps {
  id?: string;
  content?: string; // For user messages
  blocks?: AssistantBlock[]; // For assistant response blocks
  role: 'user' | 'assistant' | 'system';
  timestamp: Date;
  isLoading?: boolean;
  className?: string;
  user?: {
    name?: string;
    email?: string;
    imageUrl?: string;
  };
  showAvatar?: boolean;
  hasError?: boolean;
  errorType?: ErrorType;
  onRegenerate?: () => void;
  tokensInput?: number;
  tokensOutput?: number;
  contextTokens?: number;
  commitSha?: string;
  projectId?: string;
  sessionId?: string;
  attachments?: Attachment[];
  metadata?: {
    revertInfo?: { messageId: string; commitSha: string; timestamp: string };
    [key: string]: unknown;
  }; // NEW: System message metadata
}

export interface ChatInputProps {
  onSendMessage: (message: string, options?: MessageOptions) => Promise<void>;
  isLoading?: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  'data-testid'?: string;
}

export interface ChatInputAttachmentsProps {
  attachments: AttachedImage[];
  onRemoveAttachment: (index: number) => void;
}

export interface ChatMessageAttachmentsProps {
  attachments: Attachment[];
}

export interface ChatInterfaceProps {
  projectId: string;
  className?: string;
  activeChatSessionId?: string | null;
  sessionId?: string; // Session ID for fetching session-specific messages
  model?: string; // AI model name from server config
  isBuildInProgress?: boolean; // Whether a build is currently in progress
  isBuildFailed?: boolean; // Whether the build has failed or been cancelled
  // Requirements mode props
  mode?: 'development' | 'requirements'; // Chat mode - development uses sessions, requirements uses project-level messages
  projectStatus?: 'requirements' | 'requirements_ready' | 'in_development' | 'active'; // Project status for requirements mode
  onConfirmRequirements?: () => void; // Callback when user confirms requirements
  canConfirm?: boolean; // Whether confirm button should be enabled
  isConfirming?: boolean; // Whether confirmation is in progress
}

// Content Block Types (for streaming UI state)
export interface ContentBlock {
  id: string;
  index: number;
  type: 'thinking' | 'text' | 'tool';
  content: string;
  status: 'streaming' | 'completed' | 'error';
  isCollapsed?: boolean; // For thinking blocks
  timestamp: Date;
  toolName?: string; // For tool blocks
  toolResult?: string; // For tool blocks
  toolInput?: ToolInput; // For tool blocks - contains input parameters like file_path
  toolId?: string; // For tool blocks - unique identifier for matching tool_start/tool_stop events
}

// Assistant Response Types
export interface AssistantResponse {
  id: string;
  contentBlocks: ContentBlock[];
  timestamp: Date;
  status: 'streaming' | 'completed';
}

// File Upload Types
export interface AttachedImage {
  file: File;
  previewUrl: string;
}

// Attachment metadata (from database)
export interface Attachment {
  id: string;
  projectId: string;
  filename: string;
  storedFilename: string;
  fileUrl: string;
  fileType: 'image' | 'document';
  mediaType: string;
  fileSize: number | null;
  createdAt: Date;
}

// Base64-encoded image content for Claude multipart prompts (internal, used in ImageInput union)
interface ImageContent {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string; // base64-encoded image data
}

// URL-based image content (fetched and converted to base64 by CLI)
export interface ImageUrlContent {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  url: string; // S3 or public URL to fetch
}

// Union type for image input - supports both base64 and URL formats
export type ImageInput = ImageContent | ImageUrlContent;

// Streaming Event Types (kosuke-cli format)
export interface StreamingEvent {
  // Event types from kosuke-cli
  type: // Plan phase events
    | 'tool_call'
    | 'message'
    | 'done'
    // Build phase events
    | 'build_started'
    | 'ticket_started'
    | 'ticket_phase'
    | 'ticket_completed'
    | 'ticket_committed'
    | 'progress'
    | 'ship_tool_call'
    | 'ship_message'
    | 'test_tool_call'
    | 'test_message'
    | 'migrate_tool_call'
    | 'migrate_message'
    // Error handling
    | 'error';

  // Event payload from kosuke-cli
  data?: Record<string, unknown>;
}

// Revert Operation Types
export interface RevertToMessageRequest {
  message_id: string;
}

export interface RevertToMessageResponse {
  success: boolean;
  reverted_to_commit: string;
  message: string;
}

// Build Job Types
export interface BuildTask {
  id: string;
  externalId: string;
  title: string;
  description: string;
  type: string | null;
  category: string | null;
  estimatedEffort: number;
  status: 'todo' | 'in_progress' | 'done' | 'error' | 'cancelled';
  error: string | null;
  cost: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuildJobResponse {
  buildJob: {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    totalCost: number;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  progress: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    inProgressTasks: number;
  };
  tasks: BuildTask[];
}
