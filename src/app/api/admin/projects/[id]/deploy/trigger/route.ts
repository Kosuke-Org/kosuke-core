import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { chatSessions, deployJobs, projects } from '@/lib/db/schema';
import { deployQueue } from '@/lib/queue';
import { JOB_NAMES } from '@/lib/queue/config';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

/**
 * POST /api/admin/projects/[id]/deploy/trigger
 * Trigger deploy workflow for a project
 * Requires super admin access and project status must be 'paid'
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

    // Verify project status is 'paid'
    if (project.status !== 'paid') {
      return NextResponse.json(
        { error: `Project status must be 'paid' to deploy. Current status: ${project.status}` },
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

    // Verify that kosuke.config.json has production configuration
    const sandboxClient = new SandboxClient(defaultSession.id);
    try {
      const configContent = await sandboxClient.readFile('kosuke.config.json');
      const config = JSON.parse(configContent);
      if (!config.production) {
        return NextResponse.json(
          {
            error:
              'Production configuration is missing in kosuke.config.json. Please configure deploy settings first.',
          },
          { status: 400 }
        );
      }
    } catch (error) {
      const isNotFound = error instanceof Error && error.message.includes('not found');
      return NextResponse.json(
        {
          error: isNotFound
            ? 'kosuke.config.json not found. Please configure the project first.'
            : 'Failed to read kosuke.config.json',
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 400 }
      );
    }

    // Create deploy job in database
    const [deployJob] = await db
      .insert(deployJobs)
      .values({
        projectId,
        status: 'pending',
      })
      .returning();

    // Add job to queue
    await deployQueue.add(JOB_NAMES.PROCESS_DEPLOY, {
      deployJobId: deployJob.id,
      projectId,
      sessionId: defaultSession.id,
      cwd: '/app/project',
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
        message: 'Deploy workflow triggered successfully',
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
