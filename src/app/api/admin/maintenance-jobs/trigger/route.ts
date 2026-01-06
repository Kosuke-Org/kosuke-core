import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { maintenanceJobs, projects, type MaintenanceJobType } from '@/lib/db/schema';
import { triggerMaintenanceJobNow } from '@/lib/queue';
import { and, eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/maintenance-jobs/trigger
 * Manually trigger maintenance jobs for one or more projects (super admin only)
 * If projectIds is empty, triggers for ALL projects
 */
export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const body = await request.json();
    const { projectIds, jobType } = body as {
      projectIds?: string[];
      jobType: MaintenanceJobType;
    };

    if (!jobType) {
      return NextResponse.json({ error: 'jobType is required' }, { status: 400 });
    }

    // Validate job type
    const validJobTypes: MaintenanceJobType[] = ['sync_rules', 'analyze', 'security_check'];
    if (!validJobTypes.includes(jobType)) {
      return NextResponse.json({ error: 'Invalid job type' }, { status: 400 });
    }

    // Get target projects
    let targetProjects: { id: string; name: string }[];

    if (!projectIds || projectIds.length === 0) {
      // Fetch all projects
      targetProjects = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.isArchived, false));
    } else {
      // Fetch specified projects
      targetProjects = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(inArray(projects.id, projectIds));
    }

    if (targetProjects.length === 0) {
      return NextResponse.json({ error: 'No projects found' }, { status: 404 });
    }

    // Trigger jobs for each project
    let triggeredCount = 0;

    for (const project of targetProjects) {
      // Find or create maintenance job record for this project/type
      let maintenanceJob = await db.query.maintenanceJobs.findFirst({
        where: and(eq(maintenanceJobs.projectId, project.id), eq(maintenanceJobs.jobType, jobType)),
      });

      if (!maintenanceJob) {
        const [newJob] = await db
          .insert(maintenanceJobs)
          .values({
            projectId: project.id,
            jobType,
            enabled: false,
          })
          .returning();
        maintenanceJob = newJob;
      }

      // Queue the job
      await triggerMaintenanceJobNow(maintenanceJob.id, project.id, jobType);
      triggeredCount++;
    }

    const isAll = !projectIds || projectIds.length === 0;
    const message = isAll
      ? `Triggered "${jobType}" for all ${triggeredCount} projects`
      : `Triggered "${jobType}" for ${triggeredCount} project${triggeredCount !== 1 ? 's' : ''}`;

    return NextResponse.json({
      success: true,
      data: {
        message,
        triggeredCount,
        jobType,
      },
    });
  } catch (error) {
    console.error('Error triggering maintenance jobs:', error);

    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Failed to trigger maintenance jobs' }, { status: 500 });
  }
}
