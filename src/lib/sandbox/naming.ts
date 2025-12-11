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
 * Format: kosuke-sandbox_{projectId}_{sessionId}
 */
export function generateSandboxName(projectId: string, sessionId: string): string {
  const sanitizedProjectId = sanitizeUUID(projectId);
  const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9]/g, '');
  return `${SANDBOX_PREFIX}_${sanitizedProjectId}_${sanitizedSessionId}`;
}

/**
 * Generate preview host for Traefik routing
 * Format: project-{projectId}-{sessionId}.{domain}
 */
export function generatePreviewHost(projectId: string, sessionId: string, domain: string): string {
  const sanitizedProjectId = sanitizeUUID(projectId).replace(/_/g, '');
  const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9]/g, '');
  return `project-${sanitizedProjectId.substring(0, 8)}-${sanitizedSessionId}.${domain}`;
}

/**
 * Generate Postgres database name for preview environment
 * Format: preview_{projectId}_{sessionId}
 */
export function generatePreviewDatabaseName(projectId: string, sessionId: string): string {
  const sanitizedProjectId = sanitizeUUID(projectId);
  const sanitizedSessionId = sanitizeUUID(sessionId);
  return `preview_${sanitizedProjectId}_${sanitizedSessionId}`;
}
