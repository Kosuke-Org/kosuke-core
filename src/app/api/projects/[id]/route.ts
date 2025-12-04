import { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatSessions, projects } from '@/lib/db/schema';
import { deleteDir, getProjectPath } from '@/lib/fs/operations';
import { createKosukeOctokit, createUserOctokit } from '@/lib/github/client';
import { deleteGitHubWebhook } from '@/lib/github/webhooks';
import { getPreviewService } from '@/lib/previews';
import { verifyProjectAccess } from '@/lib/projects';
import { eq } from 'drizzle-orm';

// Schema for updating a project
const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
});

/**
 * GET /api/projects/[id]
 * Get a specific project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get the session
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    return ApiResponseHandler.success(project);
  } catch (error) {
    return ApiErrorHandler.handle(error);
  }
}

/**
 * PATCH /api/projects/[id]
 * Update a project
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get the session
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess, project, isOrgAdmin } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Only org admins can update project settings
    if (!isOrgAdmin) {
      return ApiErrorHandler.forbidden('Only organization admins can update project settings');
    }

    // Parse the request body
    const body = await request.json();

    // Validate the request body
    const result = updateProjectSchema.safeParse(body);
    if (!result.success) {
      return ApiErrorHandler.validationError(result.error);
    }

    // Update the project
    const updateData = { ...result.data, updatedAt: new Date() };
    const [updatedProject] = await db.update(projects).set(updateData).where(eq(projects.id, projectId)).returning();

    return ApiResponseHandler.success(updatedProject);
  } catch (error) {
    return ApiErrorHandler.handle(error);
  }
}

/**
 * DELETE /api/projects/[id]
 * Archive a project (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get the session
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess, project, isOrgAdmin } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Only org admins can delete projects
    if (!isOrgAdmin) {
      return ApiErrorHandler.forbidden('Only organization admins can delete projects');
    }

    // Read delete options from request body (optional)
    let deleteRepo = false;
    try {
      const body = await request.json();
      deleteRepo = Boolean(body?.deleteRepo);
    } catch {
      // No body provided; keep defaults
    }

    // Step 1: Destroy all preview containers for this project before file deletion
    try {
      console.log(`Destroying all previews for project ${projectId} before deletion`);

      // Get all session IDs for this project
      const sessions = await db
        .select({ sessionId: chatSessions.sessionId })
        .from(chatSessions)
        .where(eq(chatSessions.projectId, projectId));
      const sessionIds = sessions.map(s => s.sessionId);

      const previewService = getPreviewService();
      const cleanupResult = await previewService.destroyAllProjectPreviews(projectId, sessionIds);

      console.log(
        `Preview cleanup completed for project ${projectId}: ` +
          `${cleanupResult.stopped} destroyed, ${cleanupResult.failed} failed`
      );

      if (cleanupResult.failed > 0) {
        console.warn(
          `Some containers failed to destroy for project ${projectId}. ` +
            `Manual cleanup may be required.`
        );
      }
    } catch (previewError) {
      // Log but continue - we still want to proceed even if destroying previews fails
      console.error(`Error destroying previews for project ${projectId}:`, previewError);
      console.log(`Continuing with project deletion despite preview cleanup failure`);
    }

    // Step 2: Delete project files after containers are stopped
    const projectDir = getProjectPath(projectId);
    let filesWarning = null;

    try {
      await deleteDir(projectDir);
      console.log(`Successfully deleted project directory: ${projectDir}`);
    } catch (dirError) {
      console.error(`Error deleting project directory: ${projectDir}`, dirError);
      filesWarning = "Project deleted but some files could not be removed";
    }

    // Step 3: Delete GitHub webhook if it exists
    await deleteGitHubWebhook(project);

    // Step 4: Optionally delete the associated GitHub repository
    if (deleteRepo && project.githubOwner && project.githubRepoName) {
      try {
        const kosukeOrg = process.env.NEXT_PUBLIC_GITHUB_WORKSPACE;
        const isKosukeRepo = project.githubOwner === kosukeOrg;

        const github = isKosukeRepo
          ? createKosukeOctokit()
          : await createUserOctokit(userId);

        await github.rest.repos.delete({
          owner: project.githubOwner,
          repo: project.githubRepoName,
        });

        console.log(`Deleted GitHub repository ${project.githubOwner}/${project.githubRepoName}`);
      } catch (ghError) {
        console.error('Error deleting GitHub repository:', ghError);
        // Continue with project deletion even if GitHub deletion fails
      }
    }

    // Step 5: Archive the project
    const [archivedProject] = await db.update(projects).set({ isArchived: true, updatedAt: new Date() }).where(eq(projects.id, projectId)).returning();

    return ApiResponseHandler.success({
      ...archivedProject,
      ...(filesWarning && { warning: filesWarning }),
    });
  } catch (error) {
    return ApiErrorHandler.handle(error);
  }
}
