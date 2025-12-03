/**
 * Database Service
 * Manages session-specific PostgreSQL databases
 */

import { generatePreviewResourceName } from '@/lib/previews/naming';
import type {
  Column,
  DatabaseInfo,
  DatabaseSchema,
  QueryResult,
  TableData,
  TableSchema,
} from '@/lib/types/database';
import postgres from 'postgres';

interface ConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

/**
 * Database Service for session-specific operations
 */
export class DatabaseService {
  private dbName: string;
  private config: ConnectionConfig;

  constructor(projectId: string, sessionId: string) {
    if (!sessionId) {
      throw new Error('session_id is required for DatabaseService');
    }

    this.dbName = generatePreviewResourceName(projectId, sessionId);
    this.validateDatabaseName(this.dbName);

    // Parse connection config from POSTGRES_URL
    const postgresUrl = process.env.POSTGRES_URL;
    if (!postgresUrl) {
      throw new Error('POSTGRES_URL environment variable is not set');
    }

    this.config = this.parsePostgresUrl(postgresUrl);
  }

  // Validation helpers
  private validateTableName(tableName: string): string {
    // Only allow alphanumeric characters, underscores, and hyphens
    if (!/^[a-zA-Z0-9_-]+$/.test(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }
    return tableName;
  }

  private validateDatabaseName(dbName: string): string {
    // PostgreSQL allows letters, digits, underscores, and hyphens
    // Database names must start with a letter or underscore
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(dbName)) {
      throw new Error(`Invalid database name: ${dbName}`);
    }

    // PostgreSQL has a limit of 63 characters for database names
    if (dbName.length > 63) {
      throw new Error(`Database name too long (max 63 chars): ${dbName}`);
    }

    return dbName;
  }

  private parsePostgresUrl(url: string): ConnectionConfig {
    const parsedUrl = new URL(url);

    return {
      host: parsedUrl.hostname,
      port: parseInt(parsedUrl.port || '5432', 10),
      username: parsedUrl.username,
      password: parsedUrl.password,
    };
  }

  /**
   * Get the full database URL for this session
   * Used by kosuke-cli for migrations
   */
  getDatabaseUrl(): string {
    const { host, port, username, password } = this.config;
    return `postgres://${username}:${password}@${host}:${port}/${this.dbName}`;
  }

  /**
   * Get database connection; creates the database if it does not exist
   */
  private async getConnection(): Promise<ReturnType<typeof postgres>> {
    try {
      // Try to connect to the session-specific database
      const sql = postgres({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
        database: this.dbName,
        max: 1, // Single connection for this operation
      });

      // Test connection
      await sql`SELECT 1`;
      return sql;
    } catch (error: unknown) {
      // Check if database doesn't exist
      if (error && typeof error === 'object' && 'code' in error && error.code === '3D000') {
        // Database doesn't exist, create it
        console.log(`Database ${this.dbName} does not exist, creating it...`);
        await this.createDatabase();

        // Try connecting again
        const sql = postgres({
          host: this.config.host,
          port: this.config.port,
          username: this.config.username,
          password: this.config.password,
          database: this.dbName,
          max: 1,
        });

        await sql`SELECT 1`;
        return sql;
      }

      console.error(`Failed to connect to database ${this.dbName}:`, error);
      throw new Error(
        `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create the database if it doesn't exist
   */
  private async createDatabase(): Promise<void> {
    let sql: ReturnType<typeof postgres> | null = null;

    try {
      // Connect to postgres database to create the new one
      sql = postgres({
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        password: this.config.password,
        database: 'postgres',
        max: 1,
      });

      // Use unsafe to create database (postgres.js doesn't support parameterized CREATE DATABASE)
      await sql.unsafe(`CREATE DATABASE "${this.dbName}"`);
      console.log(`Created database: ${this.dbName}`);
    } catch (error: unknown) {
      // Check if database already exists
      if (error && typeof error === 'object' && 'code' in error && error.code === '42P04') {
        console.log(`Database ${this.dbName} already exists`);
      } else {
        console.error(`Failed to create database ${this.dbName}:`, error);
        throw new Error(
          `Database creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    } finally {
      if (sql) {
        await sql.end();
      }
    }
  }

  /**
   * Get basic database information
   */
  async getDatabaseInfo(): Promise<DatabaseInfo> {
    let sql: ReturnType<typeof postgres> | null = null;

    try {
      sql = await this.getConnection();

      // Get table count
      const tablesResult = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::text as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `;
      const tablesCount = parseInt(tablesResult[0]?.count || '0', 10);

      const databaseSizeResult = await sql<Array<{ size: string }>>`
        SELECT pg_size_pretty(pg_database_size(${this.dbName})) as size
      `;

      const dbSize = databaseSizeResult[0]?.size || '0 KB';

      return {
        connected: true,
        database_path: `postgres://${this.config.host}:${this.config.port}/${this.dbName}`,
        tables_count: tablesCount,
        database_size: dbSize,
      };
    } catch (error) {
      console.error('Error getting database info:', error);
      return {
        connected: false,
        database_path: `postgres://${this.config.host}:${this.config.port}/${this.dbName}`,
        tables_count: 0,
        database_size: '0 KB',
      };
    } finally {
      if (sql) {
        await sql.end();
      }
    }
  }

  /**
   * Get database schema information
   */
  async getSchema(): Promise<DatabaseSchema> {
    let sql: ReturnType<typeof postgres> | null = null;

    try {
      sql = await this.getConnection();

      // Get all tables in public schema
      const tableRows = await sql<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `;

      const tables: TableSchema[] = [];

      for (const tableRow of tableRows) {
        const tableName = tableRow.table_name;

        // Get table columns
        const columnsInfo = await sql<
          Array<{
            column_name: string;
            data_type: string;
            is_nullable: string;
            column_default: string | null;
          }>
        >`
          SELECT
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${tableName}
          ORDER BY ordinal_position
        `;

        // Get primary keys
        const pkRows = await sql<Array<{ column_name: string }>>`
          SELECT column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_name = ${tableName}
            AND tc.constraint_type = 'PRIMARY KEY'
        `;
        const primaryKeys = new Set(pkRows.map(row => row.column_name));

        // Get foreign keys
        const fkRows = await sql<
          Array<{
            column_name: string;
            foreign_table_name: string;
            foreign_column_name: string;
          }>
        >`
          SELECT
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = ${tableName}
        `;

        const foreignKeys = new Map(
          fkRows.map(row => [
            row.column_name,
            `${row.foreign_table_name}.${row.foreign_column_name}`,
          ])
        );

        // Get row count
        const validatedTableName = this.validateTableName(tableName);
        const countResult = await sql<Array<{ count: string }>>`
          SELECT COUNT(*)::text as count FROM ${sql(validatedTableName)}
        `;
        const rowCount = parseInt(countResult[0]?.count || '0', 10);

        const columns: Column[] = columnsInfo.map(col => ({
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
      if (sql) {
        await sql.end();
      }
    }
  }

  /**
   * Get data from a specific table
   */
  async getTableData(
    tableName: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<TableData> {
    let sql: ReturnType<typeof postgres> | null = null;

    try {
      // Validate table name first to prevent SQL injection
      const validatedTableName = this.validateTableName(tableName);
      sql = await this.getConnection();

      // Validate table exists
      const tableExists = await sql<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${validatedTableName}
      `;

      if (tableExists.length === 0) {
        throw new Error(`Table '${validatedTableName}' does not exist`);
      }

      // Get total count
      const countResult = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::text as count FROM ${sql(validatedTableName)}
      `;
      const totalRows = parseInt(countResult[0]?.count || '0', 10);

      // Get data with pagination
      const rows = await sql<Array<Record<string, unknown>>>`
        SELECT * FROM ${sql(validatedTableName)}
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      return {
        table_name: validatedTableName,
        total_rows: totalRows,
        returned_rows: rows.length,
        limit,
        offset,
        data: rows,
      };
    } catch (error) {
      console.error('Error getting table data:', error);
      throw new Error(
        `Failed to get table data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      if (sql) {
        await sql.end();
      }
    }
  }

  /**
   * Execute a SELECT query safely
   */
  async executeQuery(query: string): Promise<QueryResult> {
    let sql: ReturnType<typeof postgres> | null = null;

    try {
      // Only allow SELECT queries for security
      const queryUpper = query.trim().toUpperCase();
      if (!queryUpper.startsWith('SELECT')) {
        throw new Error('Only SELECT queries are allowed');
      }

      sql = await this.getConnection();

      const rows = await sql.unsafe<Array<Record<string, unknown>>>(query);

      // Get column names from the first row if available
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return {
        columns,
        rows: rows.length,
        data: rows,
        query,
      };
    } catch (error) {
      console.error('Error executing query:', error);
      throw new Error(
        `Failed to execute query: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      if (sql) {
        await sql.end();
      }
    }
  }
}
