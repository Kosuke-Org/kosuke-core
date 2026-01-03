import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { projectAuditLogs, projects } from '@/lib/db/schema';

/**
 * POST /api/admin/projects/[id]/revert-requirements
 * Revert project from 'requirements_ready' back to 'requirements'
 * Requires super admin access
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { userId } = await auth();
    const { id: projectId } = await params;

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Check if project is in requirements_ready status
    if (project.status !== 'requirements_ready') {
      return NextResponse.json(
        {
          error: 'Project must be in requirements_ready status to revert',
          currentStatus: project.status,
        },
        { status: 400 }
      );
    }

    // Update project status back to requirements
    await db
      .update(projects)
      .set({
        status: 'requirements',
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    // Create audit log
    await db.insert(projectAuditLogs).values({
      projectId,
      userId: userId || 'admin',
      action: 'requirements_reverted',
      previousValue: 'requirements_ready',
      newValue: 'requirements',
      metadata: {
        revertedAt: new Date().toISOString(),
        revertedBy: userId || 'admin',
        reason: 'Admin action',
      },
    });

    console.log(
      `[API /admin/revert-requirements] ✅ Project ${projectId} reverted to requirements`
    );

    return NextResponse.json({
      success: true,
      data: {
        projectId: project.id,
        projectName: project.name,
        status: 'requirements',
        message: 'Project reverted to requirements gathering',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/revert-requirements] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to revert project',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
