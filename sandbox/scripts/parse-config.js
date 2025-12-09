#!/usr/bin/env node

/**
 * Parse kosuke.config.json and write environment variables to .env file
 * Usage: node parse-config.js
 * Output: /tmp/kosuke.env file
 *
 * Handles:
 * - Service directories for bun/python
 * - Storage connection_variable (maps storage type to custom env var name)
 * - Service connection_variable (internal URLs for inter-service communication)
 * - Service external_connection_variable (external URL for entrypoint)
 * - Environment variables with __KSK__* placeholder resolution
 */

import { readFileSync, writeFileSync } from 'fs';

const CONFIG_FILE = '/app/project/kosuke.config.json';
const OUTPUT_FILE = '/tmp/kosuke.env';

// Default ports for services inside the sandbox
const SERVICE_PORTS = {
  bun: 3000,
  python: 8000,
};

function escapeEnvValue(value) {
  const str = String(value);
  if (str.includes(' ') || str.includes('"') || str.includes("'") || str.includes('\n')) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

function main() {
  try {
    const configContent = readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(configContent);

    const services = config.preview?.services || {};
    const storages = config.preview?.storages || {};
    const environment = config.preview?.environment || {};

    const envLines = [];
    const finalEnv = {};

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Process services: extract directories, entrypoint, and connection URLs
    // ─────────────────────────────────────────────────────────────────────────
    let bunDir = '';
    let pythonDir = '';
    let entrypointService = null;

    for (const [name, svc] of Object.entries(services)) {
      // Track entrypoint (only one allowed)
      if (svc.is_entrypoint && !entrypointService) {
        entrypointService = { name, ...svc };
      }

      // Extract service directories
      if (svc.type === 'bun') {
        if (!bunDir) {
          bunDir = svc.directory;
        }
      } else if (svc.type === 'python') {
        if (!pythonDir) {
          pythonDir = svc.directory;
        }
      }

      // Service connection_variable (inter-service communication via localhost)
      if (svc.connection_variable) {
        const port = SERVICE_PORTS[svc.type];
        const connectionUrl = `http://localhost:${port}`;
        finalEnv[svc.connection_variable] = connectionUrl;
        console.log(`Service connection: ${svc.connection_variable} = ${connectionUrl}`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. External connection URL for entrypoint
    // ─────────────────────────────────────────────────────────────────────────
    if (entrypointService?.external_connection_variable) {
      const externalUrl = process.env.KOSUKE_EXTERNAL_URL;
      if (externalUrl) {
        finalEnv[entrypointService.external_connection_variable] = externalUrl;
        console.log(
          `External connection: ${entrypointService.external_connection_variable} = ${externalUrl}`
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Process storages: extract hasRedis and connection URLs
    // ─────────────────────────────────────────────────────────────────────────
    let hasRedis = false;

    for (const [_, storageConfig] of Object.entries(storages)) {
      if (storageConfig.type === 'redis') {
        hasRedis = true;
        if (storageConfig.connection_variable) {
          finalEnv[storageConfig.connection_variable] = 'redis://localhost:6379';
          console.log(
            `Storage connection: ${storageConfig.connection_variable} = redis://localhost:6379`
          );
        }
      } else if (storageConfig.type === 'postgres') {
        const postgresUrl = process.env.KOSUKE_POSTGRES_URL;
        if (storageConfig.connection_variable && postgresUrl) {
          finalEnv[storageConfig.connection_variable] = postgresUrl;
          console.log(`Storage connection: ${storageConfig.connection_variable} = ${postgresUrl}`);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Process environment: resolve __KSK__* placeholders
    // ─────────────────────────────────────────────────────────────────────────
    for (const [key, value] of Object.entries(environment)) {
      if (typeof value === 'string') {
        if (value.startsWith('__KSK__')) {
          finalEnv[key] = process.env[value] || '';
        } else {
          finalEnv[key] = value;
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Build output and write .env file
    // ─────────────────────────────────────────────────────────────────────────

    // Supervisor config variables
    envLines.push(`KOSUKE_BUN_DIR=${escapeEnvValue(bunDir)}`);
    envLines.push(`KOSUKE_PYTHON_DIR=${escapeEnvValue(pythonDir)}`);
    envLines.push(`KOSUKE_HAS_REDIS=${hasRedis ? 'true' : 'false'}`);

    // All other environment variables
    for (const [key, value] of Object.entries(finalEnv)) {
      envLines.push(`${key}=${escapeEnvValue(value)}`);
    }

    writeFileSync(OUTPUT_FILE, envLines.join('\n') + '\n');
    console.log(`✅ Config parsed, ${envLines.length} variables written to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error(`⚠️ Config parse error: ${error.message}`);
    process.exit(1);
  }
}

main();
