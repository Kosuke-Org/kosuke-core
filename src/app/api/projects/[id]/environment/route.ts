import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

const updateEnvironmentSchema = z.object({
  values: z.record(z.string(), z.string()),
});

/**
 * GET /api/projects/[id]/environment
 * Fetch environment values from kosuke.config.json
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

    console.log(`[API /environment GET] Project: ${projectId}`);
    console.log(`[API /environment GET] Running sandbox: ${runningSandbox?.sessionId || 'none'}`);

    if (!runningSandbox) {
      return NextResponse.json(
        { error: 'No running sandbox found for this project' },
        { status: 400 }
      );
    }

    // Get environment values from sandbox via SandboxClient
    const client = new SandboxClient(runningSandbox.sessionId);
    const result = await client.getEnvironmentValues('/app/project');

    if (!result.success) {
      console.error(`[API /environment GET] Sandbox error:`, result.error);
      return NextResponse.json(
        { error: result.error || 'Failed to fetch environment values' },
        { status: 500 }
      );
    }

    console.log(
      `[API /environment GET] Found ${Object.keys(result.data?.environment || {}).length} environment variables`
    );

    return NextResponse.json({
      environment: result.data?.environment || {},
      path: result.data?.path,
      projectId: project.id,
      status: project.status,
    });
  } catch (error) {
    console.error('[API /environment GET] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch environment values',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[id]/environment
 * Update environment values in kosuke.config.json
 * Only allowed during 'environments' status
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Only allow updates during requirements_ready phase (when env preview is shown)
    if (project.status !== 'requirements_ready') {
      return NextResponse.json(
        { error: 'Environment can only be edited during the requirements_ready phase' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { values } = updateEnvironmentSchema.parse(body);

    // Find a running sandbox for this project
    const manager = getSandboxManager();
    const allSandboxes = await manager.listProjectSandboxes(projectId);
    const runningSandbox = allSandboxes.find(s => s.status === 'running');

    if (!runningSandbox) {
      return NextResponse.json(
        { error: 'No running sandbox found for this project' },
        { status: 400 }
      );
    }

    // Update environment values in sandbox via SandboxClient
    const client = new SandboxClient(runningSandbox.sessionId);
    const result = await client.updateEnvironmentValues(values, '/app/project');

    if (!result.success) {
      console.error(`[API /environment PUT] Sandbox error:`, result.error);
      return NextResponse.json(
        { error: result.error || 'Failed to update environment values' },
        { status: 500 }
      );
    }

    console.log(`[API /environment PUT] Updated ${Object.keys(values).length} environment values`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /environment PUT] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to update environment values',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
