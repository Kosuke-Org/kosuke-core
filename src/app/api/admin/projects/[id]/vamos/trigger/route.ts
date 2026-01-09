import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { projects, vamosJobs } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { vamosQueue } from '@/lib/queue';
import { JOB_NAMES } from '@/lib/queue/config';

interface TriggerVamosBody {
  withTests?: boolean;
  isolated?: boolean;
}

/**
 * POST /api/admin/projects/[id]/vamos/trigger
 * Trigger vamos workflow for a project using command-mode container
 * Requires super admin access and project status must be 'in_development'
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { id: projectId } = await params;
    const body: TriggerVamosBody = await request.json().catch(() => ({}));
    const withTests = body.withTests ?? false;
    const isolated = body.isolated ?? true;

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify project status is 'in_development'
    if (project.status !== 'in_development') {
      return NextResponse.json(
        {
          error: `Project status must be 'in_development' to run vamos. Current status: ${project.status}`,
        },
        { status: 400 }
      );
    }

    // Get GitHub token for pushing commits
    const githubToken = await getProjectGitHubToken(project);
    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token not available' }, { status: 500 });
    }

    // Build repo URL
    const repoUrl =
      project.githubRepoUrl ||
      `https://github.com/${project.githubOwner}/${project.githubRepoName}`;

    // Create vamos job in database
    const [vamosJob] = await db
      .insert(vamosJobs)
      .values({
        projectId,
        status: 'pending',
        totalPhases: 6,
        completedPhases: 0,
      })
      .returning();

    // Add job to queue
    // Note: SandboxManager handles database creation, API keys, and other env vars
    await vamosQueue.add(JOB_NAMES.PROCESS_VAMOS, {
      vamosJobId: vamosJob.id,
      projectId,
      withTests,
      isolated,
      repoUrl,
      branch: project.defaultBranch || 'main',
      githubToken,
      orgId: project.orgId ?? undefined,
    });

    console.log(
      `[API /admin/vamos/trigger] ✅ Vamos job ${vamosJob.id} created and queued for project ${projectId}`
    );

    return NextResponse.json({
      success: true,
      data: {
        jobId: vamosJob.id,
        projectId: project.id,
        projectName: project.name,
        status: 'pending',
        withTests,
        isolated,
        message: 'Vamos workflow triggered successfully (command mode)',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/vamos/trigger] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to trigger vamos workflow',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
