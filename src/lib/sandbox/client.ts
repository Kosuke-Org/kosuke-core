/**
 * Sandbox Client
 * HTTP client for communicating with sandbox containers
 */

import type { MessageParam } from '@anthropic-ai/sdk/resources';

import { getSandboxManager } from './manager';
import type { FileInfo, GitPullResponse, MessageAttachment } from './types';

export class SandboxClient {
  private projectId: string;
  private sessionId: string;
  private baseUrl: string;

  constructor(projectId: string, sessionId: string) {
    this.projectId = projectId;
    this.sessionId = sessionId;

    const manager = getSandboxManager();
    this.baseUrl = manager.getSandboxAgentUrl(projectId, sessionId);
  }

  /**
   * Get the base URL for this sandbox
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ============================================================
  // AGENT MESSAGING
  // ============================================================

  /**
   * Send message to agent (returns raw Response for SSE streaming)
   */
  async sendMessage(
    content: string | MessageParam,
    attachments: MessageAttachment[] | undefined,
    githubToken: string,
    remoteId?: string | null
  ): Promise<Response> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        attachments,
        githubToken,
        remoteId,
      }),
    });

    if (!response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
      const error = await response.text();
      throw new Error(`Failed to send message: ${error}`);
    }

    return response;
  }

  /**
   * Send message and stream events via async generator
   */
  async *streamMessage(
    content: string | MessageParam,
    attachments: MessageAttachment[] | undefined,
    githubToken: string,
    remoteId?: string | null
  ): AsyncGenerator<Record<string, unknown>> {
    const response = await this.sendMessage(content, attachments, githubToken, remoteId);

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              return;
            }

            try {
              const event = JSON.parse(data);
              yield event;
            } catch {
              console.warn('Failed to parse SSE event:', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ============================================================
  // FILE OPERATIONS
  // ============================================================

  /**
   * List files in sandbox
   */
  async listFiles(): Promise<FileInfo[]> {
    const response = await fetch(`${this.baseUrl}/files`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to list files: HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.files;
  }

  /**
   * Read file content from sandbox
   */
  async readFile(filePath: string): Promise<string> {
    // Ensure path doesn't start with /
    const cleanPath = filePath.replace(/^\/+/, '');

    const response = await fetch(`${this.baseUrl}/files/${cleanPath}`, {
      method: 'GET',
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(`Failed to read file: HTTP ${response.status}`);
    }

    return response.text();
  }

  /**
   * Write file content to sandbox
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    // Ensure path doesn't start with /
    const cleanPath = filePath.replace(/^\/+/, '');

    const response = await fetch(`${this.baseUrl}/files/${cleanPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to write file: HTTP ${response.status}`);
    }
  }

  /**
   * Check if a file exists in sandbox
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await this.readFile(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // GIT OPERATIONS
  // ============================================================

  /**
   * Pull latest changes in sandbox
   */
  async pull(branch: string, githubToken: string): Promise<GitPullResponse> {
    const response = await fetch(`${this.baseUrl}/git/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, githubToken }),
    });

    if (!response.ok) {
      return {
        success: false,
        changed: false,
        error: `HTTP ${response.status}`,
      };
    }

    return response.json();
  }
}
