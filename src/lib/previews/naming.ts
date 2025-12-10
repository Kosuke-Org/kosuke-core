/**
 * Preview resource naming conventions
 * Centralized naming for databases, containers, and services within preview sessions
 */

/**
 * Sanitize UUID parts for preview resource names
 * Replace hyphens with underscores for consistency across databases and containers
 */
function sanitizeUUID(part: string): string {
  return part.toLowerCase().replace(/-/g, '_');
}

/**
 * Generate standardized preview resource name
 * Used for databases, containers, and services within preview sessions
 * Reads PREVIEW_RESOURCE_PREFIX from environment (defaults to 'kosuke_preview_')
 * Format: <prefix><projectId>_<sessionId>[_<type>]
 *
 * @param projectId - Project ID (UUID)
 * @param sessionId - Session ID (UUID)
 * @param type - Optional resource type (e.g., 'redis', 'bun', 'python')
 *               Omit for database name
 * @returns Sanitized resource name
 *
 * @example
 * generatePreviewResourceName('550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001')
 * // => 'kosuke_preview_550e8400e29b41d4a716446655440000_550e8400e29b41d4a716446655440001'
 *
 * @example
 * // With PREVIEW_RESOURCE_PREFIX=pv- env var:
 * generatePreviewResourceName('550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001', 'redis')
 * // => 'pv-550e8400e29b41d4a716446655440000_550e8400e29b41d4a716446655440001_redis'
 *
 * @example
 * // Databases convert dash to underscore for SQL compatibility:
 * generatePreviewResourceName('550e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440001')
 * // => 'pv_550e8400e29b41d4a716446655440000_550e8400e29b41d4a716446655440001'
 */
export function generatePreviewResourceName(
  projectId: string,
  sessionId: string,
  type?: string
): string {
  const prefix = process.env.PREVIEW_RESOURCE_PREFIX!;
  // For databases, convert dash to underscore for SQL compatibility
  const actualPrefix = type ? prefix : prefix.replace(/-/g, '_');
  const name = `${actualPrefix}${sanitizeUUID(projectId)}_${sanitizeUUID(sessionId)}`;
  return type ? `${name}_${type}` : name;
}
