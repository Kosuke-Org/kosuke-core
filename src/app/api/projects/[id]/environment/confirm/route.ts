import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { projectAuditLogs, projects } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

/**
 * POST /api/projects/[id]/environment/confirm
 * Confirm environment variables and transition to environments_ready
 * Validates all environment variables are filled before confirming
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

    // Only allow confirmation during requirements_ready phase (when env preview is shown)
    if (project.status !== 'requirements_ready') {
      return NextResponse.json(
        { error: 'Project must be in requirements_ready status to confirm environment' },
        { status: 400 }
      );
    }

    // Find a running sandbox for this project
    const manager = getSandboxManager();
    const allSandboxes = await manager.listProjectSandboxes(projectId);
    const runningSandbox = allSandboxes.find(s => s.status === 'running');

    console.log(`[API /environment/confirm] Project: ${projectId}`);
    console.log(
      `[API /environment/confirm] Running sandbox: ${runningSandbox?.sessionId || 'none'}`
    );

    if (!runningSandbox) {
      return NextResponse.json(
        { error: 'No running sandbox found for this project' },
        { status: 400 }
      );
    }

    // Fetch environment values via SandboxClient and validate all are filled
    const client = new SandboxClient(runningSandbox.sessionId);
    const result = await client.getEnvironmentValues('/app/project');

    if (!result.success) {
      console.error(`[API /environment/confirm] Failed to fetch environment values:`, result.error);
      return NextResponse.json(
        { error: 'Failed to fetch environment values for validation' },
        { status: 500 }
      );
    }

    const environment = result.data?.environment || {};

    // Check for empty values
    const emptyVars = Object.entries(environment)
      .filter(([, value]) => value === '')
      .map(([key]) => key);

    if (emptyVars.length > 0) {
      console.log(
        `[API /environment/confirm] Found ${emptyVars.length} empty variables:`,
        emptyVars
      );
      return NextResponse.json(
        {
          error: 'All environment variables must be filled',
          emptyVariables: emptyVars,
        },
        { status: 400 }
      );
    }

    // ============================================================
    // COMMIT ENVIRONMENT CONFIG TO GIT (before changing status)
    // ============================================================

    // Get GitHub token for the project
    const githubToken = await getProjectGitHubToken(project);

    // Commit environment configuration via sandbox
    const commitResult = await client.commitEnvironment(
      githubToken,
      'chore: configure environment variables\n\nEnvironment variables confirmed and ready for deployment'
    );

    if (!commitResult.success) {
      console.error(
        `[API /environment/confirm] Failed to commit environment config:`,
        commitResult.error
      );
      return NextResponse.json(
        {
          error: 'Failed to commit environment configuration to git',
          details: commitResult.message || commitResult.error,
        },
        { status: 500 }
      );
    }

    console.log(
      `[API /environment/confirm] Environment config committed: ${commitResult.data?.sha || 'no changes'}`
    );

    // ============================================================
    // UPDATE PROJECT STATUS
    // ============================================================

    // Update status to environments_ready
    await db
      .update(projects)
      .set({
        status: 'environments_ready',
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    // Create audit log with commit info
    await db.insert(projectAuditLogs).values({
      projectId,
      userId,
      action: 'environment_confirmed',
      previousValue: 'requirements_ready',
      newValue: 'environments_ready',
      metadata: {
        confirmedAt: new Date().toISOString(),
        variableCount: Object.keys(environment).length,
        commitSha: commitResult.data?.sha || null,
        commitBranch: commitResult.data?.branch || null,
      },
    });

    console.log(`[API /environment/confirm] ✅ Project ${projectId} environment confirmed`);

    return NextResponse.json({
      success: true,
      data: {
        projectId: project.id,
        status: 'environments_ready',
        message: 'Environment variables confirmed and committed',
        variableCount: Object.keys(environment).length,
        commitSha: commitResult.data?.sha || null,
      },
    });
  } catch (error) {
    console.error('[API /environment/confirm] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to confirm environment',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
