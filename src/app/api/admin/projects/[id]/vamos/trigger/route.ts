import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { chatSessions, projects, vamosJobs } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { vamosQueue } from '@/lib/queue';
import { JOB_NAMES } from '@/lib/queue/config';
import { getSandboxManager } from '@/lib/sandbox';
import { getSandboxDatabaseUrl } from '@/lib/sandbox/database';

interface TriggerVamosBody {
  withTests?: boolean;
  isolated?: boolean;
}

/**
 * POST /api/admin/projects/[id]/vamos/trigger
 * Trigger vamos workflow for a project
 * Requires super admin access and project status must be 'paid'
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

    // Verify project status is 'paid'
    if (project.status !== 'paid') {
      return NextResponse.json(
        { error: `Project status must be 'paid' to run vamos. Current status: ${project.status}` },
        { status: 400 }
      );
    }

    // Get the default chat session for this project
    const defaultSession = await db.query.chatSessions.findFirst({
      where: and(eq(chatSessions.projectId, projectId), eq(chatSessions.isDefault, true)),
    });

    if (!defaultSession) {
      return NextResponse.json(
        { error: 'No default chat session found for this project' },
        { status: 400 }
      );
    }

    // Check if sandbox exists and is running, auto-start if not
    const sandboxManager = getSandboxManager();
    let sandbox = await sandboxManager.getSandbox(defaultSession.id);

    if (!sandbox || sandbox.status !== 'running') {
      console.log(
        `[API /admin/vamos/trigger] Sandbox not running for session ${defaultSession.id}, starting agent-only sandbox...`
      );

      const githubToken = await getProjectGitHubToken(project);
      if (!githubToken) {
        return NextResponse.json({ error: 'GitHub token not available' }, { status: 500 });
      }
      const repoUrl =
        project.githubRepoUrl ||
        `https://github.com/${project.githubOwner}/${project.githubRepoName}`;

      sandbox = await sandboxManager.createSandbox({
        projectId,
        sessionId: defaultSession.id,
        branchName: defaultSession.branchName,
        repoUrl,
        githubToken,
        mode: 'production',
        servicesMode: 'agent-only',
        orgId: project.orgId ?? undefined,
      });

      console.log(
        `[API /admin/vamos/trigger] Agent-only sandbox started for session ${defaultSession.id}`
      );
    }

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

    // Get sandbox database URL from proper configuration
    const dbUrl = getSandboxDatabaseUrl(defaultSession.id);

    // Get GitHub token for pushing commits
    const githubToken = await getProjectGitHubToken(project);
    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token not available' }, { status: 500 });
    }

    // Add job to queue
    await vamosQueue.add(JOB_NAMES.PROCESS_VAMOS, {
      vamosJobId: vamosJob.id,
      projectId,
      sessionId: defaultSession.id,
      cwd: '/app/project',
      dbUrl,
      url: sandbox.url || undefined,
      withTests,
      isolated,
      githubToken,
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
        message: 'Vamos workflow triggered successfully',
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
