import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { ApiResponseHandler } from '@/lib/api/responses';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatSessions, projects } from '@/lib/db/schema';
import { createRepositoryFromTemplate } from '@/lib/github';
import { getUserGitHubToken } from '@/lib/github/client';
import { createGitHubWebhook } from '@/lib/github/webhooks';

// GitHub needs time to initialize repos after creation
const GITHUB_REPO_INIT_DELAY_MS = 10_000; // 10 seconds

// Schema for project creation with GitHub integration
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  prompt: z.string().min(1),
  github: z.object({
    type: z.enum(['create', 'import']),
    repositoryName: z.string().optional(),
    repositoryUrl: z.string().optional(),
    description: z.string().optional(),
    isPrivate: z.boolean().optional(),
  }),
});

/**
 * GET /api/projects
 * Get all projects for the current user's active organization
 */
export async function GET() {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Filter by active organization
    if (!orgId) {
      return NextResponse.json([]);
    }

    // Query projects for the active organization
    const orgProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.orgId, orgId), eq(projects.isArchived, false)))
      .orderBy(desc(projects.createdAt));

    return NextResponse.json(orgProjects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * Helper function to create a GitHub repository in Kosuke org
 * Uses service token - no user GitHub connection required
 */
async function createGitHubRepository(
  projectName: string,
  projectId: string
) {
  const templateRepo = process.env.TEMPLATE_REPOSITORY;
  if (!templateRepo) {
    throw new Error('TEMPLATE_REPOSITORY not configured');
  }

  // Create repository in Kosuke-Org using updated function
  const repoData = await createRepositoryFromTemplate({
    name: projectName,
    private: true,
    templateRepo,
  });

  // Wait for GitHub to initialize the repository
  await new Promise(resolve => setTimeout(resolve, GITHUB_REPO_INIT_DELAY_MS));

  // Clone the repository locally using GitHub App token
  try {
    const { getKosukeGitHubToken } = await import('@/lib/github/client');
    const { GitOperations } = await import('@/lib/github/git-operations');
    const kosukeToken = await getKosukeGitHubToken();
    const gitOps = new GitOperations();
    await gitOps.cloneRepository(repoData.url, projectId, kosukeToken);
    console.log(`✅ Repository cloned successfully to project ${projectId}`);
  } catch (cloneError) {
    console.error('Repository created but failed to clone locally:', cloneError);
    // Don't throw - repository was created successfully
  }

  return repoData;
}

/**
 * Helper function to import a GitHub repository
 * Parses repository URL, gets repo info, and clones it locally
 */
async function importGitHubRepository(
  userId: string,
  repositoryUrl: string,
  projectId: string
) {
  // Parse repository URL to get owner and repo name
  const urlMatch = repositoryUrl.match(/github\.com[/:]([\w-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!urlMatch) {
    throw new Error('Invalid GitHub repository URL');
  }

  const [, owner, repo] = urlMatch;

  // Get repository info using Octokit
  const { createUserOctokit } = await import('@/lib/github/client');
  const octokit = await createUserOctokit(userId);

  try {
    const { data: repoInfo } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    // Clone repository locally
    const githubToken = await getUserGitHubToken(userId);
    if (!githubToken) {
      throw new Error('GitHub token not found');
    }

    const { GitOperations } = await import('@/lib/github/git-operations');
    const gitOps = new GitOperations();
    const projectPath = await gitOps.cloneRepository(repositoryUrl, projectId, githubToken);

    console.log(`✅ Repository imported successfully to ${projectPath}`);

    return {
      repoInfo: {
        owner: repoInfo.owner.login,
        name: repoInfo.name,
        full_name: repoInfo.full_name,
        clone_url: repoInfo.clone_url,
        default_branch: repoInfo.default_branch,
      },
      importResult: {
        success: true,
        project_id: projectId,
        project_path: projectPath,
      },
    };
  } catch (error) {
    console.error('Error importing repository:', error);
    if (error instanceof Error && error.message.includes('Not Found')) {
      throw new Error('Repository not found or not accessible');
    }
    throw error;
  }
}

/**
 * POST /api/projects
 * Create a new project with GitHub integration
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Require active organization
    if (!orgId) {
      return ApiErrorHandler.badRequest('No organization selected. Please select an organization to create a project.');
    }

    // Parse and validate the request body
    const body = await request.json();
    const result = createProjectSchema.safeParse(body);
    if (!result.success) {
      return ApiErrorHandler.validationError(result.error);
    }

    const { name, github } = result.data;

    // Validate GitHub configuration based on type
    if (github.type === 'import' && !github.repositoryUrl) {
      return ApiErrorHandler.badRequest('Repository URL is required for importing repositories');
    }

    // Check GitHub connection for import
    if (github.type === 'import') {
      const { getUserGitHubInfo } = await import('@/lib/github/client');
      const githubInfo = await getUserGitHubInfo(userId);

      if (!githubInfo) {
        return ApiErrorHandler.unauthorized(
          'GitHub connection required to import repositories. Please connect your GitHub account in settings.'
        );
      }
    }

    // Use a transaction to ensure atomicity
    const createdProject = await db.transaction(async (tx) => {
      // First create the project
      const [project] = await tx
        .insert(projects)
        .values({
          name: name,
          description: github.description || null,
          orgId: orgId,
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create the default "main" session for this project
      // This allows cleanup job to track activity for the main branch preview
      await tx.insert(chatSessions).values({
        projectId: project.id,
        userId: userId,
        title: 'Main',
        sessionId: 'main',
        isDefault: true,
        status: 'active',
      });

      // Handle GitHub operations based on type
      if (github.type === 'create') {
        // Create in Kosuke org (no user GitHub required)
        const repoData = await createGitHubRepository(
          name, // Use project name
          project.id
        );

        // Update project with GitHub info
        const [updatedProject] = await tx
          .update(projects)
          .set({
            githubRepoUrl: repoData.url,
            githubOwner: repoData.owner, // 'Kosuke-Org'
            githubRepoName: repoData.name,
            isImported: false,
            lastGithubSync: new Date(),
          })
          .where(eq(projects.id, project.id))
          .returning();

        return updatedProject;
      } else {
        // Import mode - requires user GitHub connection
        const { repoInfo } = await importGitHubRepository(
          userId,
          github.repositoryUrl!,
          project.id
        );

        // Update project with GitHub info
        const [updatedProject] = await tx
          .update(projects)
          .set({
            githubRepoUrl: github.repositoryUrl,
            githubOwner: repoInfo.owner, // User's GitHub username
            githubRepoName: repoInfo.name,
            isImported: true,
            lastGithubSync: new Date(),
          })
          .where(eq(projects.id, project.id))
          .returning();

        return updatedProject;
      }
    });

    // Create GitHub webhook for push events to main branch (non-blocking)
    // This is done outside the transaction so webhook failures don't roll back project creation
    try {
      const webhookId = await createGitHubWebhook(createdProject);

      if (webhookId) {
        // Store webhook ID for cleanup on project deletion
        await db
          .update(projects)
          .set({ githubWebhookId: webhookId })
          .where(eq(projects.id, createdProject.id));

        console.log(`✅ Webhook ${webhookId} created for project ${createdProject.id}`);
      }
    } catch (webhookError) {
      // Log but don't fail - project was created successfully
      console.error(`⚠️ Failed to create webhook for project ${createdProject.id}:`, webhookError);
    }

    return ApiResponseHandler.created({ project: createdProject });
  } catch (error) {
    console.error('Error creating project with GitHub integration:', error);

    // Return specific error messages for GitHub-related failures
    if (error instanceof Error) {
      if (error.message.includes('repository')) {
        return ApiErrorHandler.badRequest(error.message);
      }
    }

    return ApiErrorHandler.handle(error);
  }
}
