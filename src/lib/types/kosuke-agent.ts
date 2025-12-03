/**
 * Kosuke Agent Types
 *
 * Configuration types for the Kosuke Agent pipeline.
 */

export interface KosukeAgentConfig {
  /** Organization ID */
  orgId: string;
  /** Project ID */
  projectId: string;
  /** Session ID for ticket storage */
  sessionId: string;
  /** Working directory path */
  cwd: string;
  /** Database URL for migrations (required) */
  dbUrl: string;
  /** Enable code review after implementation (default: true) */
  enableReview?: boolean;
  /** Enable testing for frontend tickets (default: false) */
  enableTest?: boolean;
  /** Base URL for testing */
  testUrl?: string;
}
