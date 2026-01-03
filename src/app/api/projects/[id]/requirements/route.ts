import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

/**
 * GET /api/projects/[id]/requirements
 * Fetch the requirements document for a project
 * Reads .kosuke/docs.md from the sandbox container
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

    // Find a running sandbox for this project
    const manager = getSandboxManager();
    const allSandboxes = await manager.listProjectSandboxes(projectId);
    const runningSandbox = allSandboxes.find(s => s.status === 'running');

    console.log(`[API /requirements] Project: ${projectId}`);
    console.log(`[API /requirements] Sandboxes found: ${allSandboxes.length}`);
    console.log(`[API /requirements] Running sandbox: ${runningSandbox?.sessionId || 'none'}`);

    let docs = '';

    if (runningSandbox) {
      // Get requirements document from sandbox
      const client = new SandboxClient(runningSandbox.sessionId);
      console.log(`[API /requirements] Calling sandbox at: ${client.getBaseUrl()}`);
      try {
        const requirements = await client.getRequirements();
        docs = requirements.docs;
        console.log(`[API /requirements] Got docs: ${docs.length} chars`);
      } catch (error) {
        // Sandbox endpoint not available - return empty
        console.error(`[API /requirements] Sandbox error:`, error);
        docs = '';
      }
    } else {
      console.log(`[API /requirements] No running sandbox, returning empty docs`);
    }

    return NextResponse.json({
      docs,
      projectId: project.id,
      projectName: project.name,
      status: project.status,
    });
  } catch (error) {
    console.error('[API /requirements] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch requirements',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
