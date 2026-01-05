import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { chatSessions, projects, vamosJobs } from '@/lib/db/schema';
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

    // Check if sandbox exists and is running
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.getSandbox(defaultSession.id);

    if (!sandbox || sandbox.status !== 'running') {
      return NextResponse.json(
        { error: 'Sandbox is not running. Please ensure the project sandbox is active.' },
        { status: 400 }
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
