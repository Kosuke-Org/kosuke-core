import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { deployJobs, projects } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { deployQueue } from '@/lib/queue';
import { JOB_NAMES } from '@/lib/queue/config';
import { getAnthropicApiKey } from '@/lib/sandbox';

/**
 * POST /api/admin/projects/[id]/deploy/trigger
 * Trigger deploy workflow for a project using command-mode container
 * Requires super admin access and project status must be 'active'
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { id: projectId } = await params;

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify project status is 'active'
    if (project.status !== 'active') {
      return NextResponse.json(
        { error: `Project status must be 'active' to deploy. Current status: ${project.status}` },
        { status: 400 }
      );
    }

    // Get GitHub token
    const githubToken = await getProjectGitHubToken(project);
    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token not available' }, { status: 500 });
    }

    // Get Anthropic API key (org custom key or system default)
    const anthropicApiKey = await getAnthropicApiKey(project.orgId ?? undefined);

    // Get Render credentials from environment
    const renderApiKey = process.env.RENDER_API_KEY;
    const renderOwnerId = process.env.RENDER_OWNER_ID;

    if (!renderApiKey || !renderOwnerId) {
      return NextResponse.json(
        { error: 'Render deployment credentials not configured' },
        { status: 500 }
      );
    }

    // Build repo URL
    const repoUrl =
      project.githubRepoUrl ||
      `https://github.com/${project.githubOwner}/${project.githubRepoName}`;

    // Create deploy job in database
    const [deployJob] = await db
      .insert(deployJobs)
      .values({
        projectId,
        status: 'pending',
      })
      .returning();

    // Add job to queue with all required env vars
    await deployQueue.add(JOB_NAMES.PROCESS_DEPLOY, {
      deployJobId: deployJob.id,
      projectId,
      env: {
        repoUrl,
        branch: project.defaultBranch || 'main',
        githubToken,
        orgId: project.orgId ?? undefined,
        anthropicApiKey,
        renderApiKey,
        renderOwnerId,
      },
    });

    console.log(
      `[API /admin/deploy/trigger] ✅ Deploy job ${deployJob.id} created and queued for project ${projectId}`
    );

    return NextResponse.json({
      success: true,
      data: {
        jobId: deployJob.id,
        projectId: project.id,
        projectName: project.name,
        status: 'pending',
        message: 'Deploy workflow triggered successfully (command mode)',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/deploy/trigger] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to trigger deploy workflow',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
