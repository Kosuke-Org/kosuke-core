/**
 * Agent Types
 * Centralized type definitions for the Kosuke Agent
 */

// ============================================
// Stream Events (for client consumption)
// ============================================

interface ContentBlockStartEvent {
  type: 'content_block_start';
  index?: number;
}

interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  delta_type: 'text_delta';
  text: string;
  index: number;
}

interface ContentBlockStopEvent {
  type: 'content_block_stop';
  index?: number;
}

interface ToolStartEvent {
  type: 'tool_start';
  tool_name: string;
  tool_input: unknown;
  tool_id: string;
}

interface ToolStopEvent {
  type: 'tool_stop';
  tool_id: string;
  tool_result: unknown;
  is_error: boolean;
}

interface MessageCompleteEvent {
  type: 'message_complete';
  remoteId?: string | null;
}

interface ErrorEvent {
  type: 'error';
  message: string;
}

export type StreamEvent =
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | ToolStartEvent
  | ToolStopEvent
  | MessageCompleteEvent
  | ErrorEvent;

// ============================================
// Git Operations
// ============================================

export interface GitHubCommit {
  sha: string;
  message: string;
  url: string;
  filesChanged: number;
  timestamp: Date;
}

export interface CommitOptions {
  sessionPath: string;
  sessionId: string;
  message?: string;
  githubToken: string;
  userId: string;
}

export interface GitChangesSummary {
  changedFiles: string[];
  additions: number;
  deletions: number;
}
