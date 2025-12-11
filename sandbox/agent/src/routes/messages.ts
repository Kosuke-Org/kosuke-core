/**
 * Messages Route
 * POST /messages - Send message to agent, stream response
 */

import type { FastifyInstance } from 'fastify';
import { AgentService } from '../services/agent.js';
import { GitService } from '../services/git.js';

interface Attachment {
  upload: {
    filename: string;
    fileUrl: string;
    fileType: string;
    mediaType: string;
    fileSize: number;
  };
}

interface MessagesBody {
  content: string;
  attachments?: Attachment[];
  githubToken: string;
  remoteId?: string | null;
}

export async function messagesRoutes(app: FastifyInstance) {
  const agentService = new AgentService();
  const gitService = new GitService();

  app.post<{ Body: MessagesBody }>('/messages', async (request, reply) => {
    const { content, attachments, githubToken, remoteId } = request.body || {};

    if (!content) {
      return reply.status(400).send({ error: 'Content is required' });
    }

    if (!githubToken) {
      return reply.status(400).send({ error: 'GitHub token is required' });
    }

    app.log.info('Received message request');

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    try {
      // Build message parameter
      const messageParam = agentService.buildMessageParam(content, attachments);

      // Stream agent responses
      let capturedRemoteId: string | null = null;

      for await (const event of agentService.run(messageParam, remoteId)) {
        // Capture remoteId from message_complete event
        if (event.type === 'message_complete' && event.remoteId) {
          capturedRemoteId = event.remoteId as string;
        }

        // Send SSE event
        const data = JSON.stringify(event);
        reply.raw.write(`data: ${data}\n\n`);
      }

      // Commit and push changes
      let commitSha: string | null = null;
      try {
        app.log.info('Committing and pushing changes...');
        const commitResult = await gitService.commitAndPush(githubToken);
        commitSha = commitResult.sha;

        if (commitSha) {
          app.log.info(`Changes committed: ${commitSha.substring(0, 8)}`);
        } else {
          app.log.info('No changes to commit');
        }
      } catch (err) {
        app.log.error({ err }, 'Failed to commit changes');
      }

      // Send completion event
      const completeEvent = {
        type: 'complete',
        remoteId: capturedRemoteId,
        commitSha,
      };
      reply.raw.write(`data: ${JSON.stringify(completeEvent)}\n\n`);
      reply.raw.write('data: [DONE]\n\n');
    } catch (err) {
      app.log.error({ err }, 'Error in message processing');

      const errorEvent = {
        type: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      };
      reply.raw.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    } finally {
      reply.raw.end();
    }
  });
}
