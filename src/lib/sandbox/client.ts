/**
 * Sandbox Client
 * HTTP client for communicating with sandbox containers
 */

import type { ImageInput } from '@/lib/types';

import { getSandboxConfig } from './config';
import { getSandboxManager } from './manager';
import type { FileInfo, GitPullResponse, GitRevertResponse } from './types';

export class SandboxClient {
  private sessionId: string;
  private baseUrl: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;

    const manager = getSandboxManager();
    this.baseUrl = manager.getSandboxAgentUrl(sessionId);
  }

  /**
   * Get the base URL for this sandbox
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  // ============================================================
  // KOSUKE SERVE API
  // ============================================================

  // --- File Operations ---

  /**
   * List files in sandbox
   */
  async listFiles(): Promise<FileInfo[]> {
    const response = await fetch(`${this.baseUrl}/api/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        cwd: '/app/project',
      }),
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
    // Make path relative to /app/project if it's absolute
    const relativePath = filePath.startsWith('/app/project/')
      ? filePath.slice('/app/project/'.length)
      : filePath.replace(/^\/+/, '');

    const response = await fetch(`${this.baseUrl}/api/files/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cwd: '/app/project',
        filepath: relativePath,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error(`File not found: ${filePath}`);
      }
      throw new Error(
        `Failed to read file: HTTP ${response.status} - ${errorData.message || response.statusText}`
      );
    }

    const data = await response.json();
    return data.content;
  }

  /**
   * Write file content to sandbox
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    // Make path relative to /app/project if it's absolute
    const relativePath = filePath.startsWith('/app/project/')
      ? filePath.slice('/app/project/'.length)
      : filePath.replace(/^\/+/, '');

    const response = await fetch(`${this.baseUrl}/api/files/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cwd: '/app/project',
        filepath: relativePath,
        content,
      }),
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

  // --- Git Operations ---

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

  /**
   * Revert to a specific commit and force push
   */
  async revert(commitSha: string, githubToken: string): Promise<GitRevertResponse> {
    const response = await fetch(`${this.baseUrl}/git/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commitSha, githubToken }),
    });

    if (!response.ok) {
      return {
        success: false,
        commitSha: '',
        error: `HTTP ${response.status}`,
      };
    }

    return response.json();
  }

  // --- Plan/Build Streaming ---

  /**
   * Stream plan phase from kosuke serve (SSE)
   */
  async *streamPlan(
    query: string,
    cwd: string,
    options?: {
      noTest?: boolean;
      resume?: string | null;
      images?: ImageInput[]; // Optional images (base64 or URL - CLI will normalize)
    }
  ): AsyncGenerator<Record<string, unknown>> {
    const config = getSandboxConfig();

    // Use env var config if noTest not explicitly provided
    const noTest = options?.noTest ?? !config.test;

    const response = await fetch(`${this.baseUrl}/api/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        query,
        cwd,
        noTest,
        resume: options?.resume,
        images: options?.images,
      }),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`Plan request failed: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body from plan endpoint');
    }

    yield* this.parseSSEStream(response.body);
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Parse SSE stream (reusable for both streamMessage and kosuke serve endpoints)
   * Handles both event: and data: fields from SSE
   */
  private async *parseSSEStream(
    body: ReadableStream<Uint8Array>
  ): AsyncGenerator<Record<string, unknown>> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (delimited by double newlines)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          const lines = message.split('\n');
          let eventType: string | null = null;
          let eventData: string | null = null;

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6).trim();
            }
          }

          // Process complete event (must have data)
          if (eventData) {
            if (eventData === '[DONE]') {
              return;
            }

            try {
              const parsedData = JSON.parse(eventData);

              // Structure event with type field if event type was specified
              if (eventType) {
                yield { type: eventType, data: parsedData };
              } else {
                // Fallback: yield data as-is (legacy format)
                yield parsedData;
              }
            } catch (error) {
              console.warn('Failed to parse SSE event:', eventData, error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
