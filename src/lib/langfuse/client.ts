/**
 * Langfuse Client
 * Fetches and aggregates usage data from Langfuse
 */

import { LangfuseClient } from '@langfuse/client';

import { db } from '@/lib/db/drizzle';
import { chatSessions, projects } from '@/lib/db/schema';
import type { OrgUsage, ProjectUsage, SessionUsage, UsageMetrics } from '@/lib/types';

// Singleton Langfuse client
let langfuseClient: LangfuseClient | null = null;

/**
 * Get or create the Langfuse client singleton
 */
function getLangfuseClient(): LangfuseClient {
  if (!langfuseClient) {
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const baseUrl = process.env.LANGFUSE_BASE_URL;

    if (!secretKey || !publicKey) {
      throw new Error('Langfuse API keys not configured');
    }

    langfuseClient = new LangfuseClient({
      secretKey,
      publicKey,
      baseUrl,
    });
  }

  return langfuseClient;
}

/**
 * Create empty usage metrics with zero values
 */
function createEmptyMetrics(): UsageMetrics {
  return {
    input: { tokens: 0, cost: 0 },
    output: { tokens: 0, cost: 0 },
    cacheRead: { tokens: 0, cost: 0 },
    cacheCreation: { tokens: 0, cost: 0 },
    total: { tokens: 0, cost: 0 },
  };
}

/**
 * Add two UsageMetrics together
 */
function addMetrics(a: UsageMetrics, b: UsageMetrics): UsageMetrics {
  return {
    input: {
      tokens: a.input.tokens + b.input.tokens,
      cost: a.input.cost + b.input.cost,
    },
    output: {
      tokens: a.output.tokens + b.output.tokens,
      cost: a.output.cost + b.output.cost,
    },
    cacheRead: {
      tokens: a.cacheRead.tokens + b.cacheRead.tokens,
      cost: a.cacheRead.cost + b.cacheRead.cost,
    },
    cacheCreation: {
      tokens: a.cacheCreation.tokens + b.cacheCreation.tokens,
      cost: a.cacheCreation.cost + b.cacheCreation.cost,
    },
    total: {
      tokens: a.total.tokens + b.total.tokens,
      cost: a.total.cost + b.total.cost,
    },
  };
}

/**
 * Single observation data from Langfuse
 */
interface Observation {
  id: string;
  metadata?: Record<string, unknown>;
  usageDetails?: Record<string, number>;
  costDetails?: Record<string, number>;
}

/**
 * Extract usage metrics from a single observation
 */
function extractMetricsFromObservation(observation: Observation): UsageMetrics {
  const usage = observation.usageDetails || {};
  const costs = observation.costDetails || {};

  const inputTokens = usage.input || 0;
  const outputTokens = usage.output || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens || 0;

  return {
    input: { tokens: inputTokens, cost: costs.input || 0 },
    output: { tokens: outputTokens, cost: costs.output || 0 },
    cacheRead: { tokens: cacheReadTokens, cost: costs.cache_read_input_tokens || 0 },
    cacheCreation: { tokens: cacheCreationTokens, cost: costs.cache_creation_input_tokens || 0 },
    total: {
      tokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
      cost: costs.total || 0,
    },
  };
}

/**
 * Fetch all observations for an organization
 */
async function fetchAllObservationsForOrg(orgId: string): Promise<Observation[]> {
  const langfuse = getLangfuseClient();

  // Fetch traces for this org (userId = orgId)
  const listStart = performance.now();
  const response = await langfuse.api.observationsV2.getMany({
    userId: orgId,
    fields: 'core,usage,metadata',
    //type: 'GENERATION',
    limit: 1000,
  });
  console.log(
    `[Langfuse] observationsV2.getMany took ${(performance.now() - listStart).toFixed(0)}ms`
  );
  console.log(
    `[Langfuse] Found ${response.data.filter(o => (o.totalCost as number) > 0).length} observations with totalCost > 0`
  );

  return (
    response.data
      .filter(trace => Object.keys(trace.usageDetails || {}).length > 0)
      .map(trace => ({
        id: trace.id as string,
        metadata: trace.metadata as Record<string, string>,
        usageDetails: trace.usageDetails as Record<string, number>,
        costDetails: trace.costDetails as Record<string, number>,
      })) || []
  );
}

/**
 * Fetch project names from database
 */
async function fetchProjectNames(projectIds: string[]): Promise<Map<string, string>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const projectRecords = await db.select({ id: projects.id, name: projects.name }).from(projects);

  const projectMap = new Map<string, string>();
  for (const project of projectRecords) {
    projectMap.set(String(project.id), project.name);
  }

  return projectMap;
}

/**
 * Fetch session names from database
 */
async function fetchSessionNames(sessionIds: string[]): Promise<Map<string, string>> {
  if (sessionIds.length === 0) {
    return new Map();
  }

  const sessionRecords = await db
    .select({ id: chatSessions.id, title: chatSessions.title })
    .from(chatSessions);

  const sessionMap = new Map<string, string>();
  for (const session of sessionRecords) {
    sessionMap.set(String(session.id), session.title || `Session ${session.id}`);
  }

  return sessionMap;
}

/**
 * Fetch and aggregate usage data for an organization
 */
export async function getOrgUsage(orgId: string): Promise<OrgUsage> {
  const observations = await fetchAllObservationsForOrg(orgId);

  // Aggregate by project and session
  const projectSessionMap = new Map<string, Map<string, UsageMetrics>>();
  const projectIds = new Set<string>();
  const sessionIds = new Set<string>();

  for (const observation of observations) {
    const metadata = observation.metadata || {};
    const projectId = String(metadata.kosukeProjectId || 'unknown');
    const sessionId = String(metadata.kosukeSessionId || 'unknown');

    projectIds.add(projectId);
    sessionIds.add(sessionId);

    // Get or create project map
    if (!projectSessionMap.has(projectId)) {
      projectSessionMap.set(projectId, new Map());
    }
    const sessionMap = projectSessionMap.get(projectId)!;

    // Get or create session metrics
    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, createEmptyMetrics());
    }

    // Extract and add metrics from this observation
    const observationMetrics = extractMetricsFromObservation(observation);
    const currentMetrics = sessionMap.get(sessionId)!;
    sessionMap.set(sessionId, addMetrics(currentMetrics, observationMetrics));
  }

  // Fetch project and session names
  const [projectNames, sessionNames] = await Promise.all([
    fetchProjectNames(Array.from(projectIds)),
    fetchSessionNames(Array.from(sessionIds)),
  ]);

  // Build the response structure
  const projectUsages: ProjectUsage[] = [];
  let orgMetrics = createEmptyMetrics();

  for (const [projectId, sessionMap] of projectSessionMap) {
    const sessions: SessionUsage[] = [];
    let projectMetrics = createEmptyMetrics();

    for (const [sessionId, metrics] of sessionMap) {
      sessions.push({
        sessionId,
        sessionName: sessionNames.get(sessionId) || `Session ${sessionId.slice(0, 8)}...`,
        metrics,
      });
      projectMetrics = addMetrics(projectMetrics, metrics);
    }

    // Sort sessions by sessionId
    sessions.sort((a, b) => a.sessionId.localeCompare(b.sessionId));

    projectUsages.push({
      projectId,
      projectName: projectNames.get(projectId) || `Project ${projectId}`,
      metrics: projectMetrics,
      sessions,
    });

    orgMetrics = addMetrics(orgMetrics, projectMetrics);
  }

  // Sort projects by name
  projectUsages.sort((a, b) => a.projectName.localeCompare(b.projectName));

  return {
    orgId,
    metrics: orgMetrics,
    projects: projectUsages,
  };
}
