/**
 * Sandbox Types
 * TypeScript types for sandbox management
 */

// ============================================================
// SANDBOX MANAGEMENT TYPES
// ============================================================

export interface SandboxCreateOptions {
  projectId: string;
  sessionId: string;
  branchName: string;
  repoUrl: string;
  githubToken: string;
  mode: 'development' | 'production';
  orgId?: string; // Organization ID for fetching custom API keys
}

export interface SandboxInfo {
  containerId: string;
  name: string;
  sessionId: string;
  status: 'running' | 'stopped' | 'error';
  url: string;
  mode: 'development' | 'production';
  branch: string;
}

// ============================================================
// SANDBOX API TYPES
// ============================================================

export interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  lastModified?: string;
  children?: FileInfo[];
}

export interface GitPullResponse {
  success: boolean;
  changed: boolean;
  error?: string;
}

export interface GitRevertResponse {
  success: boolean;
  commitSha: string;
  error?: string;
}
