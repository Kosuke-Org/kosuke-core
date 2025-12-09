/**
 * Fastify App Configuration
 * Using Fastify 5.x
 */

import cors from '@fastify/cors';
import Fastify from 'fastify';

import { filesRoutes } from './routes/files.js';
import { gitRoutes } from './routes/git.js';
import { messagesRoutes } from './routes/messages.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Health check (excluded from logs)
  app.get('/health', { logLevel: 'silent' }, async () => {
    return { status: 'ok' };
  });

  // Register routes
  await app.register(messagesRoutes);
  await app.register(filesRoutes);
  await app.register(gitRoutes, { prefix: '/git' });

  // Error handler
  app.setErrorHandler((error: Error, _request, reply) => {
    app.log.error(error);
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  });

  return app;
}
