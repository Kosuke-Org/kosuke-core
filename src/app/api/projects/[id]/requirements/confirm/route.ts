import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { projectAuditLogs, projects } from '@/lib/db/schema';
import { sendRequirementsReadySlack } from '@/lib/slack/send-requirements-ready';

/**
 * POST /api/projects/[id]/requirements/confirm
 * Confirm that requirements gathering is complete
 * Transitions project from 'requirements' to 'requirements_ready'
 * Sends Slack notification to dev channel
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

    // Update project status to requirements_ready
    await db
      .update(projects)
      .set({
        status: 'requirements_ready',
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    // Create audit log
    await db.insert(projectAuditLogs).values({
      projectId,
      userId,
      action: 'requirements_confirmed',
      previousValue: 'requirements',
      newValue: 'requirements_ready',
      metadata: {
        confirmedAt: new Date().toISOString(),
      },
    });

    // Get user info for Slack notification
    let userName: string | undefined;
    let orgName: string | undefined;

    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      userName = user.fullName || user.firstName || user.emailAddresses[0]?.emailAddress;

      if (orgId) {
        const org = await client.organizations.getOrganization({ organizationId: orgId });
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
        message: 'Requirements confirmed and notification sent',
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
