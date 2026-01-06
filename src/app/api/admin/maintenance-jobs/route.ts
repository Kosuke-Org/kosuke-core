import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { maintenanceJobRuns, maintenanceJobs, projects } from '@/lib/db/schema';
import { and, asc, count, desc, eq, gte, lte } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/maintenance-jobs
 * Get all maintenance job runs across all projects (super admin only)
 * Supports: project filter, job type filter, status filter, date range, pagination, sorting
 */
export async function GET(request: NextRequest) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const jobType = searchParams.get('jobType');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build query conditions for maintenanceJobRuns
    const runConditions = [];
    // Build query conditions for maintenanceJobs (joined)
    const jobConditions = [];

    if (projectId) {
      jobConditions.push(eq(maintenanceJobs.projectId, projectId));
    }

    if (jobType && jobType !== 'all') {
      jobConditions.push(
        eq(maintenanceJobs.jobType, jobType as 'sync_rules' | 'analyze' | 'security_check')
      );
    }

    if (status && status !== 'all') {
      runConditions.push(
        eq(maintenanceJobRuns.status, status as 'pending' | 'running' | 'completed' | 'failed')
      );
    }

    if (dateFrom) {
      runConditions.push(gte(maintenanceJobRuns.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      runConditions.push(lte(maintenanceJobRuns.createdAt, endDate));
    }

    // Combine all conditions
    const allConditions = [...runConditions, ...jobConditions];

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(maintenanceJobRuns)
      .innerJoin(maintenanceJobs, eq(maintenanceJobRuns.maintenanceJobId, maintenanceJobs.id))
      .where(allConditions.length > 0 ? and(...allConditions) : undefined);
    const total = totalResult[0]?.count || 0;

    // Determine sort column and order
    let sortColumn;
    switch (sortBy) {
      case 'startedAt':
        sortColumn = maintenanceJobRuns.startedAt;
        break;
      case 'completedAt':
        sortColumn = maintenanceJobRuns.completedAt;
        break;
      default:
        sortColumn = maintenanceJobRuns.createdAt;
    }
    const orderFn = sortOrder === 'asc' ? asc : desc;

    // Fetch runs with job and project information
    const runs = await db
      .select({
        id: maintenanceJobRuns.id,
        maintenanceJobId: maintenanceJobRuns.maintenanceJobId,
        status: maintenanceJobRuns.status,
        startedAt: maintenanceJobRuns.startedAt,
        completedAt: maintenanceJobRuns.completedAt,
        error: maintenanceJobRuns.error,
        summary: maintenanceJobRuns.summary,
        pullRequestUrl: maintenanceJobRuns.pullRequestUrl,
        pullRequestNumber: maintenanceJobRuns.pullRequestNumber,
        createdAt: maintenanceJobRuns.createdAt,
        // Job info
        jobType: maintenanceJobs.jobType,
        projectId: maintenanceJobs.projectId,
        // Project info
        projectName: projects.name,
      })
      .from(maintenanceJobRuns)
      .innerJoin(maintenanceJobs, eq(maintenanceJobRuns.maintenanceJobId, maintenanceJobs.id))
      .innerJoin(projects, eq(maintenanceJobs.projectId, projects.id))
      .where(allConditions.length > 0 ? and(...allConditions) : undefined)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset((page - 1) * limit);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        runs,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching admin maintenance jobs:', error);

    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Failed to fetch maintenance jobs' }, { status: 500 });
  }
}
