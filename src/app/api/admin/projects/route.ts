import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { and, asc, count, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/admin/projects
 * Get all projects across all organizations (super admin only)
 * Supports: search, status filter, org filter, date range, pagination, sorting
 */
export async function GET(request: NextRequest) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const orgId = searchParams.get('orgId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build query conditions
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          eq(projects.id, search), // Exact match for ID
          ilike(projects.name, `%${search}%`),
          ilike(projects.description, `%${search}%`)
        )
      );
    }

    if (orgId) {
      conditions.push(eq(projects.orgId, orgId));
    }

    if (dateFrom) {
      conditions.push(gte(projects.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      // Include the entire end date
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(projects.createdAt, endDate));
    }

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(projects)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const total = totalResult[0]?.count || 0;

    // Determine sort column and order
    const sortColumn = sortBy === 'name' ? projects.name : projects.createdAt;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    // Fetch projects with pagination
    const projectsList = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        orgId: projects.orgId,
        createdBy: projects.createdBy,
        createdAt: projects.createdAt,
        githubRepoUrl: projects.githubRepoUrl,
        status: projects.status,
        stripeInvoiceUrl: projects.stripeInvoiceUrl,
        requirementsCompletedAt: projects.requirementsCompletedAt,
        requirementsCompletedBy: projects.requirementsCompletedBy,
      })
      .from(projects)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset((page - 1) * limit);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        projects: projectsList,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching admin projects:', error);

    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}
