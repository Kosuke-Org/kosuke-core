/**
 * Files Routes
 * GET /files - List file tree
 * GET /files/* - Read file content
 * POST /files/* - Write file content
 */

import type { FastifyInstance } from 'fastify';
import mime from 'mime-types';
import { FilesService } from '../services/files.js';

const PROJECT_DIR = process.env.PROJECT_DIR || '/app/project';

export async function filesRoutes(app: FastifyInstance) {
  const filesService = new FilesService(PROJECT_DIR);

  // List file tree
  app.get('/files', async (_request, reply) => {
    try {
      const files = await filesService.listFiles();
      return { files };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Failed to list files',
      });
    }
  });

  // Read file content
  app.get<{ Params: { '*': string } }>('/files/*', async (request, reply) => {
    const filePath = request.params['*'];

    if (!filePath) {
      return reply.status(400).send({ error: 'File path is required' });
    }

    try {
      const content = await filesService.readFile(filePath);
      const contentType = mime.lookup(filePath) || 'application/octet-stream';

      return reply.header('Content-Type', contentType).send(content);
    } catch (err) {
      app.log.error(err);
      return reply.status(404).send({ error: 'File not found' });
    }
  });

  // Write file content
  app.post<{ Params: { '*': string }; Body: { content: string } }>(
    '/files/*',
    async (request, reply) => {
      const filePath = request.params['*'];
      const { content } = request.body || {};

      if (!filePath) {
        return reply.status(400).send({ error: 'File path is required' });
      }

      if (content === undefined) {
        return reply.status(400).send({ error: 'Content is required' });
      }

      try {
        await filesService.writeFile(filePath, content);
        return { success: true };
      } catch (err) {
        app.log.error(err);
        return reply.status(500).send({
          success: false,
          error: err instanceof Error ? err.message : 'Failed to write file',
        });
      }
    }
  );
}
