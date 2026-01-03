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
  servicesMode: 'agent-only' | 'full'; // agent-only: only agent, full: agent + bun + python
  orgId?: string; // Optional - uses system default API key if not provided
}

export interface SandboxInfo {
  containerId: string;
  name: string;
  sessionId: string;
  status: 'running' | 'stopped' | 'error';
  url: string | null; // null when servicesMode is 'agent-only' (no bun service)
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
