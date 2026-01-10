import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { projectAuditLogs, projects } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';
import { sendRequirementsReadySlack } from '@/lib/slack/send-requirements-ready';

/**
 * POST /api/projects/[id]/requirements/confirm
 * Confirm that requirements gathering is complete
 * Transitions project from 'requirements' to 'requirements_ready'
 * Triggers synchronous environment analysis and sends Slack notification
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

    // Check if project is in requirements status
    if (project.status !== 'requirements') {
      return NextResponse.json(
        {
          error: 'Project must be in requirements status to confirm',
          currentStatus: project.status,
        },
        { status: 400 }
      );
    }

    // ============================================================
    // COMMIT REQUIREMENTS TO GIT (before changing status)
    // ============================================================

    // Find running sandbox for this project
    const manager = getSandboxManager();
    const allSandboxes = await manager.listProjectSandboxes(projectId);
    const runningSandbox = allSandboxes.find(s => s.status === 'running');

    if (!runningSandbox) {
      return NextResponse.json(
        { error: 'No running sandbox found. Cannot commit requirements.' },
        { status: 400 }
      );
    }

    // Get GitHub token for the project
    const githubToken = await getProjectGitHubToken(project);
    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token not available' }, { status: 500 });
    }

    // Commit requirements via sandbox
    const client = new SandboxClient(runningSandbox.sessionId);
    const commitResult = await client.commitRequirements(
      githubToken,
      'docs: add project requirements\n\nConfirmed and ready for implementation'
    );

    if (!commitResult.success) {
      console.error(
        `[API /requirements/confirm] Failed to commit requirements:`,
        commitResult.error
      );
      return NextResponse.json(
        {
          error: 'Failed to commit requirements to git',
          details: commitResult.message || commitResult.error,
        },
        { status: 500 }
      );
    }

    console.log(
      `[API /requirements/confirm] Requirements committed: ${commitResult.data?.sha || 'no changes'}`
    );

    // ============================================================
    // UPDATE PROJECT STATUS
    // ============================================================

    // Update project status to requirements_ready (triggers environment setup flow)
    await db
      .update(projects)
      .set({
        status: 'requirements_ready',
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    // ============================================================
    // RUN ENVIRONMENT ANALYSIS (SYNCHRONOUS)
    // ============================================================

    console.log(
      `[API /requirements/confirm] Starting environment analysis for project ${projectId}`
    );

    const envResult = await client.analyzeEnvironment('/app/project');

    if (!envResult.success) {
      console.error(`[API /requirements/confirm] Environment analysis failed:`, envResult.error);
      // Don't fail the request - environment can be re-analyzed later
      // Just log the error and continue
    } else {
      console.log(
        `[API /requirements/confirm] Environment analysis complete: ${envResult.data?.summary}`
      );
    }

    // Create audit log with commit info
    await db.insert(projectAuditLogs).values({
      projectId,
      userId,
      action: 'requirements_confirmed',
      previousValue: 'requirements',
      newValue: 'requirements_ready',
      metadata: {
        confirmedAt: new Date().toISOString(),
        commitSha: commitResult.data?.sha || null,
        commitBranch: commitResult.data?.branch || null,
        environmentAnalysis: envResult.success
          ? { success: true, summary: envResult.data?.summary }
          : { success: false, error: envResult.error },
      },
    });

    // Get user info for Slack notification
    let userName: string | undefined;
    let orgName: string | undefined;

    try {
      const clerkClientInstance = await clerkClient();
      const user = await clerkClientInstance.users.getUser(userId);
      userName = user.fullName || user.firstName || user.emailAddresses[0]?.emailAddress;

      if (orgId) {
        const org = await clerkClientInstance.organizations.getOrganization({
          organizationId: orgId,
        });
        orgName = org.name;
      }
    } catch (error) {
      console.warn('[API /requirements/confirm] Failed to get user/org info:', error);
    }

    // Send Slack notification
    await sendRequirementsReadySlack({
      projectId: project.id,
      projectName: project.name,
      orgName,
      confirmedBy: userName,
    });

    console.log(`[API /requirements/confirm] ✅ Project ${projectId} requirements confirmed`);

    return NextResponse.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        status: 'requirements_ready',
        environmentAnalysis: envResult.success
          ? { success: true, changes: envResult.data?.changes, summary: envResult.data?.summary }
          : { success: false, error: envResult.error },
        message: 'Requirements confirmed, environment analysis complete',
      },
    });
  } catch (error) {
    console.error('[API /requirements/confirm] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to confirm requirements',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
