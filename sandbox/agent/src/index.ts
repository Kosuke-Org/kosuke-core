/**
 * Kosuke Sandbox Agent Server
 * Fastify server that handles agent operations, git, and file access
 */

import { buildApp } from './app.js';

const PORT = parseInt(process.env.PORT || '9000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  console.log('🚀 Starting Kosuke Sandbox Agent Server...');
  console.log(`   Port: ${PORT}`);
  console.log(`   Host: ${HOST}`);
  console.log(`   Project Dir: ${process.env.PROJECT_DIR || '/app/project'}`);

  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`✅ Agent server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

main();
