import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getOctokit } from '@/lib/github/client';
import { verifyProjectAccess } from '@/lib/projects';
import { eq } from 'drizzle-orm';
// Schema for updating default branch
const updateDefaultBranchSchema = z.object({
  default_branch: z.string().min(1, 'Default branch is required'),
});

/**
 * GET /api/projects/[id]/settings/default-branch
 * Get project default branch setting and available branches
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    let availableBranches: string[] = [];

    // Get available branches from GitHub if repository is connected
    if (project.githubOwner && project.githubRepoName) {
      try {
        const github = await getOctokit(project.isImported, userId);

        const { data: branches } = await github.rest.repos.listBranches({
          owner: project.githubOwner,
          repo: project.githubRepoName,
        });

        availableBranches = branches.map(branch => branch.name);
      } catch (error) {
        console.warn('Failed to fetch GitHub branches:', error);
        // Continue without branches if GitHub fetch fails
      }
    }

    return NextResponse.json({
      default_branch: project.defaultBranch,
      available_branches: availableBranches,
    });
  } catch (error) {
    console.error('Error getting default branch settings:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * PUT /api/projects/[id]/settings/default-branch
 * Update project default branch
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    // Only org admins can change default branch
    if (!isOrgAdmin) {
      return ApiErrorHandler.forbidden('Only organization admins can change the default branch');
    }

    // Parse request body
    const body = await request.json();
    const parseResult = updateDefaultBranchSchema.safeParse(body);

    if (!parseResult.success) {
      return ApiErrorHandler.validationError(parseResult.error);
    }

    const { default_branch } = parseResult.data;

    // Validate branch exists if GitHub repo is connected
    if (project.githubOwner && project.githubRepoName) {
      try {
        const github = await getOctokit(project.isImported, userId);

        // Check if branch exists
        await github.rest.repos.getBranch({
          owner: project.githubOwner,
          repo: project.githubRepoName,
          branch: default_branch,
        });
      } catch {
        return ApiErrorHandler.badRequest(`Branch '${default_branch}' not found in repository`);
      }
    }

    // Update project default branch
    const [updatedProject] = await db
      .update(projects)
      .set({
        defaultBranch: default_branch,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    return NextResponse.json({
      default_branch: updatedProject.defaultBranch,
      success: true,
    });
  } catch (error) {
    console.error('Error updating default branch:', error);
    return ApiErrorHandler.handle(error);
  }
}
