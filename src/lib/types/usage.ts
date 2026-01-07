/**
 * Usage Types
 * Types for Langfuse usage data aggregation
 */

/**
 * Token count and cost for a single metric category
 */
interface TokenCost {
  tokens: number;
  cost: number;
}

/**
 * Usage metrics for all token categories
 */
export interface UsageMetrics {
  input: TokenCost;
  output: TokenCost;
  cacheRead: TokenCost;
  cacheCreation: TokenCost;
  total: TokenCost;
}

/**
 * Usage data for a single chat session
 */
export interface SessionUsage {
  sessionId: string;
  sessionName?: string;
  metrics: UsageMetrics;
}

/**
 * Usage data for a project, including all sessions
 */
export interface ProjectUsage {
  projectId: string;
  projectName: string;
  metrics: UsageMetrics;
  sessions: SessionUsage[];
}

/**
 * Usage data for an organization, including all projects
 */
export interface OrgUsage {
  orgId: string;
  metrics: UsageMetrics;
  projects: ProjectUsage[];
}
