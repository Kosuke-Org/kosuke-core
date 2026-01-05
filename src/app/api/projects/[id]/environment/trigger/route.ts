import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { projectAuditLogs, projects } from '@/lib/db/schema';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

/**
 * POST /api/projects/[id]/environment/trigger
 * Trigger environment analysis on the sandbox (SSE proxy)
 * This runs the environment command which analyzes docs.md and updates kosuke.config.json
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { id: projectId } = await params;

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify user has access to this project's org
    if (project.orgId && project.orgId !== orgId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Find a running sandbox for this project
    const manager = getSandboxManager();
    const allSandboxes = await manager.listProjectSandboxes(projectId);
    const runningSandbox = allSandboxes.find(s => s.status === 'running');

    console.log(`[API /environment/trigger] Project: ${projectId}`);
    console.log(
      `[API /environment/trigger] Running sandbox: ${runningSandbox?.sessionId || 'none'}`
    );

    if (!runningSandbox) {
      return new Response(JSON.stringify({ error: 'No running sandbox found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create audit log for environment trigger
    await db.insert(projectAuditLogs).values({
      projectId,
      userId,
      action: 'environment_triggered',
      metadata: { triggeredAt: new Date().toISOString() },
    });

    // Proxy SSE to sandbox
    const client = new SandboxClient(runningSandbox.sessionId);
    const response = await fetch(`${client.getBaseUrl()}/api/environment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ cwd: '/app/project' }),
    });

    if (!response.ok) {
      const errorData = await response.text().catch(() => 'Unknown error');
      console.error(`[API /environment/trigger] Sandbox error:`, errorData);
      return new Response(JSON.stringify({ error: 'Failed to trigger environment command' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[API /environment/trigger] Proxying SSE stream from sandbox`);

    // Return the SSE stream directly
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[API /environment/trigger] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to trigger environment command',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
