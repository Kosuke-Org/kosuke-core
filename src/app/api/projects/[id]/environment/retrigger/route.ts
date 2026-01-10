import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

/**
 * POST /api/projects/[id]/environment/retrigger
 * Re-trigger environment analysis for a project
 * Only allowed during requirements_ready phase
 * Calls the sandbox's environment analysis endpoint synchronously
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: projectId } = await params;

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify user has access to this project's org
    if (project.orgId && project.orgId !== orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only allow re-trigger during requirements_ready phase
    if (project.status !== 'requirements_ready') {
      return NextResponse.json(
        { error: 'Environment can only be re-analyzed during the requirements_ready phase' },
        { status: 400 }
      );
    }

    // Find a running sandbox for this project
    const manager = getSandboxManager();
    const allSandboxes = await manager.listProjectSandboxes(projectId);
    const runningSandbox = allSandboxes.find(s => s.status === 'running');

    console.log(`[API /environment/retrigger] Project: ${projectId}`);
    console.log(
      `[API /environment/retrigger] Running sandbox: ${runningSandbox?.sessionId || 'none'}`
    );

    if (!runningSandbox) {
      return NextResponse.json(
        { error: 'No running sandbox found for this project. Please start a sandbox first.' },
        { status: 400 }
      );
    }

    // Call the sandbox's environment analysis endpoint synchronously
    const client = new SandboxClient(runningSandbox.sessionId);
    const result = await client.analyzeEnvironment('/app/project');

    if (!result.success) {
      console.error(`[API /environment/retrigger] Analysis failed:`, result.error);
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Environment analysis failed',
        },
        { status: 400 }
      );
    }

    console.log(`[API /environment/retrigger] ✅ Analysis complete: ${result.data?.summary}`);

    return NextResponse.json({
      success: true,
      data: {
        changes: result.data?.changes || [],
        summary: result.data?.summary || 'Environment analysis complete',
      },
    });
  } catch (error) {
    console.error('[API /environment/retrigger] Error:', error);

    // Handle timeout errors specifically
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        {
          success: false,
          error: 'Environment analysis timed out',
          details: 'The analysis took too long. Please try again.',
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to re-trigger environment analysis',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
