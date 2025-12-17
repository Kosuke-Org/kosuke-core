/**
 * Sandbox Naming Utilities
 * Generates consistent names for sandbox resources
 */

const SANDBOX_PREFIX = 'kosuke-sandbox';

/**
 * Sanitize UUID for use in container names
 * Replaces hyphens with underscores
 */
function sanitizeUUID(uuid: string): string {
  return uuid.replace(/-/g, '_');
}

/**
 * Generate sandbox container name
 * Format: kosuke-sandbox_{sessionId}
 */
export function generateSandboxName(sessionId: string): string {
  const sanitizedId = sanitizeUUID(sessionId);
  return `${SANDBOX_PREFIX}_${sanitizedId}`;
}

/**
 * Generate preview host for Traefik routing
 * Format: {sanitizedSessionId}.{domain}
 */
export function generatePreviewHost(sessionId: string, domain: string): string {
  const sanitizedId = sanitizeUUID(sessionId).replace(/_/g, '');
  return `${sanitizedId}.${domain}`;
}

/**
 * Generate Postgres database name for preview environment
 * Format: {sanitizedSessionId}
 */
export function generatePreviewDatabaseName(sessionId: string): string {
  return sanitizeUUID(sessionId);
}
