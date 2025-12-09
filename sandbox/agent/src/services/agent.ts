/**
 * Agent Service
 * Wraps the Claude Agent SDK for message processing
 *
 * NOTE: This is a placeholder implementation.
 * The actual Claude Agent SDK integration needs to be implemented
 * based on the specific SDK version and API available.
 */

import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ContentBlockParam, MessageParam } from '@anthropic-ai/sdk/resources';

const PROJECT_DIR = process.env.PROJECT_DIR || '/app/project';
const MAX_TURNS = parseInt(process.env.AGENT_MAX_TURNS || '25', 10);
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

interface Attachment {
  upload: {
    filename: string;
    fileUrl: string;
    fileType: string;
    mediaType: string;
    fileSize: number;
  };
}

export class AgentService {
  /**
   * Build message parameter from content and attachments
   */
  buildMessageParam(content: string, attachments?: Attachment[]): MessageParam {
    // Build content blocks
    const contentBlocks: ContentBlockParam[] = [];

    // Add text content
    if (content) {
      contentBlocks.push({ type: 'text', text: content });
    }

    // Add attachments
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const { upload } = attachment;

        if (upload.fileType === 'image') {
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'url',
              url: upload.fileUrl,
            },
          });
        } else if (upload.fileType === 'document') {
          contentBlocks.push({
            type: 'document',
            source: {
              type: 'url',
              url: upload.fileUrl,
            },
          });
        }
      }
    }

    return {
      role: 'user',
      content: contentBlocks,
    };
  }

  /**
   * Run the agent and yield stream events
   *
   * NOTE: This is a placeholder that needs to be connected to the actual
   * Claude Agent SDK. The implementation below simulates the expected behavior.
   */
  async *run(message: MessageParam, remoteId?: string | null): AsyncGenerator<StreamEvent> {
    console.log(`🤖 Starting agent query in ${PROJECT_DIR}`);
    console.log(`   Model: ${MODEL}`);
    console.log(`   Max turns: ${MAX_TURNS}`);
    console.log(`   Resume ID: ${remoteId || 'new session'}`);

    try {
      // Import Claude Agent SDK dynamically
      // This allows the sandbox to work even if the SDK isn't installed during build
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      const options: Options = {
        cwd: PROJECT_DIR,
        model: MODEL,
        maxTurns: MAX_TURNS,
        permissionMode: 'acceptEdits',
        allowedTools: [
          'Task',
          'Bash',
          'Glob',
          'Grep',
          'LS',
          'Read',
          'Edit',
          'MultiEdit',
          'Write',
          'NotebookRead',
          'NotebookEdit',
          'WebFetch',
          'WebSearch',
          'TodoWrite',
          'ExitPlanMode',
        ],
        abortController: new AbortController(),
        additionalDirectories: [],
      };

      if (remoteId) {
        options.resume = remoteId;
      }

      // Create prompt generator
      const promptGenerator = this.createPromptGenerator(message);

      const queryInstance = query({
        prompt: promptGenerator,
        options,
      });

      let capturedRemoteId: string | null = null;

      for await (const sdkMessage of queryInstance) {
        // Capture remoteId from result message
        if (!remoteId && !capturedRemoteId && sdkMessage.type === 'result') {
          capturedRemoteId = sdkMessage.session_id;
        }

        // Convert SDK message to client event
        const event = this.processSDKMessage(sdkMessage);
        if (event) {
          yield event;
        }
      }

      // Yield completion with remoteId
      yield {
        type: 'message_complete',
        remoteId: capturedRemoteId,
      };
    } catch (err) {
      console.error('Agent error:', err);

      // If SDK not available, yield an error
      if (err instanceof Error && err.message.includes('Cannot find module')) {
        yield {
          type: 'error',
          message: 'Claude Agent SDK not available in this sandbox',
        };
        return;
      }

      throw err;
    }
  }

  /**
   * Create async generator for prompt input
   */
  private async *createPromptGenerator(message: MessageParam): AsyncGenerator<SDKUserMessage> {
    yield {
      type: 'user',
      session_id: '',
      message: {
        role: message.role as 'user',
        content: message.content,
      },
      parent_tool_use_id: null,
    } as SDKUserMessage;
  }

  /**
   * Process SDK message and convert to client event
   */
  private processSDKMessage(message: unknown): StreamEvent | null {
    const msg = message as Record<string, unknown>;

    if (!msg || typeof msg !== 'object' || !('type' in msg)) {
      return null;
    }

    // Handle different message types
    switch (msg.type) {
      case 'assistant':
        return {
          type: 'assistant_message',
          content: msg.message,
        };

      case 'user':
        return {
          type: 'user_message',
          content: msg.message,
        };

      case 'result':
        return {
          type: 'result',
          subtype: msg.subtype,
          session_id: msg.session_id,
        };

      case 'progress':
        return {
          type: 'progress',
          content: msg,
        };

      default:
        // Pass through other message types
        return {
          type: msg.type as string,
          ...msg,
        };
    }
  }
}
