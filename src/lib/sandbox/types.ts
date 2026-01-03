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
  branchName?: string; // Optional for requirements mode
  repoUrl?: string; // Optional for requirements mode
  githubToken?: string; // Optional for requirements mode
  mode: 'development' | 'production' | 'requirements';
  orgId?: string; // Optional - uses system default API key if not provided
}

export interface SandboxInfo {
  containerId: string;
  name: string;
  sessionId: string;
  status: 'running' | 'stopped' | 'error';
  url: string;
  mode: 'development' | 'production' | 'requirements';
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

// ============================================================
// AGENT HEALTH TYPES
// ============================================================

export interface AgentHealthResponse {
  status: 'ok' | 'error';
  alive: boolean;
  ready: boolean;
  processing: boolean;
  uptime: number;
  timestamp: string;
  memory: {
    heapUsed: number;
    heapTotal: number;
  };
}
