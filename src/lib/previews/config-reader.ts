/**
 * Configuration Reader for Preview Environments
 * Reads kosuke.config.json from cloned repositories and processes special values
 */

import type { EnvironmentConfig, KosukeConfig } from '@/lib/types/kosuke-config';
import { validateKosukeConfig } from '@/lib/types/kosuke-config';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Read kosuke.config.json from a session directory
 */
export async function readKosukeConfig(sessionPath: string): Promise<KosukeConfig> {
  const configPath = join(sessionPath, 'kosuke.config.json');

  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);

    // Validate using Zod (throws with detailed error messages)
    return validateKosukeConfig(config);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('kosuke.config.json not found in repository root');
    }
    throw new Error(
      `Failed to read kosuke.config.json: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Process special __KSK__ prefixed values in environment variables
 * Currently supports:
 * - __KSK__PREVIEW_RESEND_API_KEY: Loads PREVIEW_RESEND_API_KEY from process.env
 * - __KSK__COOKIE_PREFIX: Sets the cookie prefix for authentication cookies to the projectId
 */
export function buildEnviornment(
  environment: EnvironmentConfig,
  projectId: string
): EnvironmentConfig {
  const finalEnvironment: EnvironmentConfig = {};

  for (const [key, value] of Object.entries(environment)) {
    if (value.startsWith('__KSK__')) {
      console.log(`Special value: ${value}`);
      // Handle known special values
      if (value === '__KSK__RESEND_API_KEY') {
        finalEnvironment[key] = process.env.PREVIEW_RESEND_API_KEY || '';
      } else if (value === '__KSK__COOKIE_PREFIX') {
        finalEnvironment[key] = projectId;
      }
    } else {
      finalEnvironment[key] = value;
    }
  }

  return finalEnvironment;
}
