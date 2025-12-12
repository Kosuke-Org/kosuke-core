/**
 * Sandbox Database Management
 * Handles creation, cleanup, and querying of Postgres databases for sandbox environments
 */

import { Client } from 'pg';
import { generatePreviewDatabaseName } from './naming';
import type {
  Column,
  DatabaseInfo,
  DatabaseSchema,
  QueryResult,
  TableData,
  TableSchema,
} from './types';

// ============================================================
// CONNECTION HELPERS
// ============================================================

interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

/**
 * Parse Postgres URL into connection config
 */
function getPostgresConfig(): ConnectionConfig {
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
 * Validate table name to prevent SQL injection
 */
function validateTableName(tableName: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  return tableName;
}

/**
 * Get a database connection for a specific sandbox
 */
async function getConnection(projectId: string, sessionId: string): Promise<Client> {
  const config = getPostgresConfig();
  const dbName = generatePreviewDatabaseName(projectId, sessionId);

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: dbName,
  });

  await client.connect();
  return client;
}

// ============================================================
// DATABASE LIFECYCLE
// ============================================================

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
 * Get the database URL for a sandbox (without creating it)
 */
export function getSandboxDatabaseUrl(projectId: string, sessionId: string): string {
  const config = getPostgresConfig();
  const dbName = generatePreviewDatabaseName(projectId, sessionId);
  return `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${dbName}`;
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

// ============================================================
// DATABASE QUERIES
// ============================================================

/**
 * Get basic database information
 */
export async function getDatabaseInfo(projectId: string, sessionId: string): Promise<DatabaseInfo> {
  const config = getPostgresConfig();
  const dbName = generatePreviewDatabaseName(projectId, sessionId);

  let client: Client | null = null;

  try {
    client = await getConnection(projectId, sessionId);

    // Get table count
    const tablesResult = await client.query(`
      SELECT COUNT(*)::text as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    const tablesCount = parseInt(tablesResult.rows[0]?.count || '0', 10);

    // Get database size
    const sizeResult = await client.query('SELECT pg_size_pretty(pg_database_size($1)) as size', [
      dbName,
    ]);
    const dbSize = sizeResult.rows[0]?.size || '0 KB';

    return {
      connected: true,
      database_path: `postgres://${config.host}:${config.port}/${dbName}`,
      tables_count: tablesCount,
      database_size: dbSize,
    };
  } catch (error) {
    console.error('Error getting database info:', error);
    return {
      connected: false,
      database_path: `postgres://${config.host}:${config.port}/${dbName}`,
      tables_count: 0,
      database_size: '0 KB',
    };
  } finally {
    if (client) {
      await client.end();
    }
  }
}

/**
 * Get database schema information
 */
export async function getDatabaseSchema(
  projectId: string,
  sessionId: string
): Promise<DatabaseSchema> {
  let client: Client | null = null;

  try {
    client = await getConnection(projectId, sessionId);

    // Get all tables in public schema
    const tableRows = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tables: TableSchema[] = [];

    for (const tableRow of tableRows.rows) {
      const tableName = tableRow.table_name;

      // Get table columns
      const columnsResult = await client.query(
        `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `,
        [tableName]
      );

      // Get primary keys
      const pkResult = await client.query(
        `
        SELECT column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
      `,
        [tableName]
      );
      const primaryKeys = new Set(pkResult.rows.map(row => row.column_name));

      // Get foreign keys
      const fkResult = await client.query(
        `
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1
      `,
        [tableName]
      );
      const foreignKeys = new Map(
        fkResult.rows.map(row => [
          row.column_name,
          `${row.foreign_table_name}.${row.foreign_column_name}`,
        ])
      );

      // Get row count
      const validatedTableName = validateTableName(tableName);
      const countResult = await client.query(
        `SELECT COUNT(*)::text as count FROM "${validatedTableName}"`
      );
      const rowCount = parseInt(countResult.rows[0]?.count || '0', 10);

      const columns: Column[] = columnsResult.rows.map(col => ({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable === 'YES',
        primary_key: primaryKeys.has(col.column_name),
        foreign_key: foreignKeys.get(col.column_name) || null,
      }));

      tables.push({
        name: tableName,
        columns,
        row_count: rowCount,
      });
    }

    return { tables };
  } catch (error) {
    console.error('Error getting database schema:', error);
    throw new Error(
      `Failed to get database schema: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    if (client) {
      await client.end();
    }
  }
}

/**
 * Get data from a specific table
 */
export async function getTableData(
  projectId: string,
  sessionId: string,
  tableName: string,
  limit: number = 100,
  offset: number = 0
): Promise<TableData> {
  let client: Client | null = null;

  try {
    const validatedTableName = validateTableName(tableName);
    client = await getConnection(projectId, sessionId);

    // Validate table exists
    const tableExists = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [validatedTableName]
    );

    if (tableExists.rows.length === 0) {
      throw new Error(`Table '${validatedTableName}' does not exist`);
    }

    // Get total count
    const countResult = await client.query(
      `SELECT COUNT(*)::text as count FROM "${validatedTableName}"`
    );
    const totalRows = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get data with pagination
    const dataResult = await client.query(
      `SELECT * FROM "${validatedTableName}" LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      table_name: validatedTableName,
      total_rows: totalRows,
      returned_rows: dataResult.rows.length,
      limit,
      offset,
      data: dataResult.rows,
    };
  } catch (error) {
    console.error('Error getting table data:', error);
    throw new Error(
      `Failed to get table data: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    if (client) {
      await client.end();
    }
  }
}

/**
 * Execute a SELECT query safely
 */
export async function executeQuery(
  projectId: string,
  sessionId: string,
  query: string
): Promise<QueryResult> {
  let client: Client | null = null;

  try {
    // Only allow SELECT queries for security
    const queryUpper = query.trim().toUpperCase();
    if (!queryUpper.startsWith('SELECT')) {
      throw new Error('Only SELECT queries are allowed');
    }

    client = await getConnection(projectId, sessionId);

    const result = await client.query(query);

    // Get column names from field metadata
    const columns = result.fields?.map(f => f.name) || [];

    return {
      columns,
      rows: result.rows.length,
      data: result.rows,
      query,
    };
  } catch (error) {
    console.error('Error executing query:', error);
    throw new Error(
      `Failed to execute query: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  } finally {
    if (client) {
      await client.end();
    }
  }
}
