/**
 * Project Access Control Utilities
 *
 * Verifies user access to projects based on organization membership
 */

import { clerkService } from '@/lib/clerk';
import { db } from '@/lib/db/drizzle';
import { chatSessions, projects } from '@/lib/db/schema';
import { ORG_ROLES } from '@/lib/types/clerk';
import { and, eq } from 'drizzle-orm';

export interface ProjectAccessResult {
  hasAccess: boolean;
  project?: typeof projects.$inferSelect;
  isOrgAdmin?: boolean;
}

/**
 * Verify if a user has access to a project through organization membership
 *
 * @param userId - The Clerk user ID
 * @param projectId - The project ID to check
 * @returns Object containing access status and project data
 */
export async function verifyProjectAccess(
  userId: string,
  projectId: string
): Promise<ProjectAccessResult> {
  // Get the project (exclude archived projects)
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.isArchived, false)),
  });

  if (!project || !project.orgId) {
    return { hasAccess: false };
  }

  // Check if user is a member of the project's organization
  const memberships = await clerkService.getUserMemberships(userId);
  const membership = memberships.data.find(m => m.organization.id === project.orgId);

  if (!membership) {
    return { hasAccess: false, project };
  }

  // User has access - also check if they're an admin
  const isAdmin = membership.role === ORG_ROLES.ADMIN;

  return {
    hasAccess: true,
    project,
    isOrgAdmin: isAdmin,
  };
}

/**
 * Find a chat session by ID (UUID)
 *
 * @param projectId - The project ID
 * @param sessionId - The chat session UUID
 * @returns The chat session or undefined if not found
 */
export async function findChatSession(projectId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.projectId, projectId), eq(chatSessions.id, sessionId)));
  return session;
}
