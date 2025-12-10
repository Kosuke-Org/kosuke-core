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

export interface GitRevertResponse {
  success: boolean;
  commitSha: string;
  error?: string;
}

// ============================================================
// DATABASE TYPES
// ============================================================

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  foreign_key: string | null;
}

export interface TableSchema {
  name: string;
  columns: Column[];
  row_count: number;
}

export interface DatabaseInfo {
  connected: boolean;
  database_path: string;
  tables_count: number;
  database_size: string;
}

export interface DatabaseSchema {
  tables: TableSchema[];
}

export interface TableData {
  table_name: string;
  total_rows: number;
  returned_rows: number;
  limit: number;
  offset: number;
  data: Record<string, unknown>[];
}

export interface QueryResult {
  columns: string[];
  rows: number;
  data: Record<string, unknown>[];
  query: string;
}
