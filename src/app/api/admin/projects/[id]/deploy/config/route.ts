import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { chatSessions, projects } from '@/lib/db/schema';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

interface ProductionConfig {
  services?: Record<
    string,
    {
      plan?: string;
      envVars?: Record<string, string>;
    }
  >;
  storages?: Record<
    string,
    {
      plan?: string;
    }
  >;
}

interface UpdateConfigBody {
  production: ProductionConfig;
}

/**
 * GET /api/admin/projects/[id]/deploy/config
 * Get the current kosuke.config.json configuration
 * Requires super admin access
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { id: projectId } = await params;

    // Verify project exists
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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

    // Read kosuke.config.json from sandbox
    const sandboxClient = new SandboxClient(defaultSession.id);
    try {
      const configContent = await sandboxClient.readFile('kosuke.config.json');
      const config = JSON.parse(configContent);
      return NextResponse.json({
        hasConfig: true,
        config,
        hasProductionConfig: !!config.production,
      });
    } catch (error) {
      // File doesn't exist or couldn't be parsed
      const isNotFound = error instanceof Error && error.message.includes('not found');
      return NextResponse.json({
        hasConfig: !isNotFound,
        config: null,
        hasProductionConfig: false,
        error: isNotFound ? undefined : 'Failed to parse kosuke.config.json',
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/deploy/config GET] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to get deploy configuration',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/projects/[id]/deploy/config
 * Update the production section of kosuke.config.json
 * Requires super admin access
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { id: projectId } = await params;
    const body: UpdateConfigBody = await request.json();

    if (!body.production) {
      return NextResponse.json({ error: 'Production configuration is required' }, { status: 400 });
    }

    // Verify project exists
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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

    // Read current kosuke.config.json from sandbox
    const sandboxClient = new SandboxClient(defaultSession.id);
    let existingConfig: Record<string, unknown> = {};
    try {
      const configContent = await sandboxClient.readFile('kosuke.config.json');
      existingConfig = JSON.parse(configContent);
    } catch {
      // If file doesn't exist or parsing fails, start with empty config
    }

    // Merge production config
    const updatedConfig = {
      ...existingConfig,
      production: body.production,
    };

    // Write updated config back to sandbox
    try {
      await sandboxClient.writeFile('kosuke.config.json', JSON.stringify(updatedConfig, null, 2));
    } catch (writeError) {
      return NextResponse.json(
        {
          error: 'Failed to write kosuke.config.json',
          details: writeError instanceof Error ? writeError.message : String(writeError),
        },
        { status: 500 }
      );
    }

    console.log(
      `[API /admin/deploy/config PUT] ✅ Updated production config for project ${projectId}`
    );

    return NextResponse.json({
      success: true,
      config: updatedConfig,
      message: 'Production configuration updated successfully',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/deploy/config PUT] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to update deploy configuration',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
