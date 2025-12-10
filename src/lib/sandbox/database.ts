/**
 * Sandbox Database Management
 * Handles creation and cleanup of Postgres databases for sandbox environments
 */

import { Client } from 'pg';
import { generatePreviewDatabaseName } from './naming';

/**
 * Parse Postgres URL into connection config
 */
function getPostgresConfig() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('POSTGRES_URL environment variable is not set');
  }

  const pgUrl = new URL(url);
  return {
    host: pgUrl.hostname,
    port: parseInt(pgUrl.port || '5432'),
    user: pgUrl.username,
    password: pgUrl.password,
  };
}

/**
 * Create Postgres database for a sandbox
 * Returns the connection URL for the new database
 */
export async function createSandboxDatabase(projectId: string, sessionId: string): Promise<string> {
  const config = getPostgresConfig();
  const dbName = generatePreviewDatabaseName(projectId, sessionId);

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres',
  });

  try {
    await client.connect();

    const checkResult = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      dbName,
    ]);

    if (checkResult.rows.length === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`🐘 Created Postgres database: ${dbName}`);
    } else {
      console.log(`🐘 Database ${dbName} already exists, reusing`);
    }

    // Build connection URL for the sandbox
    return `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${dbName}`;
  } finally {
    await client.end();
  }
}

/**
 * Drop Postgres database for a sandbox
 */
export async function dropSandboxDatabase(projectId: string, sessionId: string): Promise<void> {
  const config = getPostgresConfig();
  const dbName = generatePreviewDatabaseName(projectId, sessionId);

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres',
  });

  try {
    await client.connect();

    // Terminate all connections to the database
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );

    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`🐘 Dropped Postgres database: ${dbName}`);
  } catch (error) {
    console.error(`Failed to drop database ${dbName}:`, error);
    // Don't throw - we still want to continue with container cleanup
  } finally {
    await client.end();
  }
}
