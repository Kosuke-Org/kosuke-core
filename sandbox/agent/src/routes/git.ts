/**
 * Git Routes
 * POST /git/pull - Pull latest changes
 */

import type { FastifyInstance } from 'fastify';
import { GitService } from '../services/git.js';

interface PullBody {
  branch: string;
  githubToken: string;
}

interface PullResponse {
  success: boolean;
  changed: boolean;
  error?: string;
}

export async function gitRoutes(app: FastifyInstance) {
  const gitService = new GitService();

  app.post<{ Body: PullBody; Reply: PullResponse }>('/pull', async (request, reply) => {
    const { branch, githubToken } = request.body || {};

    if (!branch) {
      return reply
        .status(400)
        .send({ success: false, changed: false, error: 'Branch is required' });
    }

    if (!githubToken) {
      return reply
        .status(400)
        .send({ success: false, changed: false, error: 'GitHub token is required' });
    }

    try {
      app.log.info(`Pulling branch: ${branch}`);
      const result = await gitService.pull(branch, githubToken);
      return result;
    } catch (err) {
      app.log.error(err);
      return {
        success: false,
        changed: false,
        error: err instanceof Error ? err.message : 'Pull failed',
      };
    }
  });
}
