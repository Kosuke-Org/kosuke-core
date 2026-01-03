import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

/**
 * GET /api/projects/[id]/sandbox/health
 * Check agent health status for ANY sandbox belonging to this project
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const manager = getSandboxManager();

    // Find any running sandbox for this project
    const allSandboxes = await manager.listProjectSandboxes(projectId);
    const runningSandbox = allSandboxes.find(s => s.status === 'running');

    // If no sandbox is running for this project
    if (!runningSandbox) {
      return NextResponse.json({
        ok: false,
        running: false,
        alive: false,
        ready: false,
        processing: false,
        sandboxStatus: 'not_found',
      });
    }

    // Check agent health using the found sandbox's session ID
    const client = new SandboxClient(runningSandbox.sessionId);
    const health = await client.getAgentHealth();

    if (!health) {
      return NextResponse.json({
        ok: false,
        running: true,
        alive: false,
        ready: false,
        processing: false,
        sandboxStatus: 'running',
        agentStatus: 'not_responding',
      });
    }

    return NextResponse.json({
      ok: true,
      running: true,
      alive: health.alive,
      ready: health.ready,
      processing: health.processing,
      uptime: health.uptime,
      memory: health.memory,
      sandboxStatus: 'running',
      agentStatus: 'healthy',
    });
  } catch (error) {
    console.error('[API /sandbox/health] Error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to check sandbox health',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
