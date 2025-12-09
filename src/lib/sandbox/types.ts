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
  repoUrl: string;
  branch: string;
  githubToken: string;
  mode: 'development' | 'production';
  agentEnabled: boolean;
  postgresUrl: string;
}

export interface SandboxInfo {
  containerId: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  url: string;
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

export interface MessageAttachment {
  upload: {
    filename: string;
    fileUrl: string;
    fileType: string;
    mediaType: string;
    fileSize: number;
  };
}

export interface GitPullResponse {
  success: boolean;
  changed: boolean;
  error?: string;
}
