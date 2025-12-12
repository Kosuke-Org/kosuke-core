import { count, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { isSuperAdminByUserId } from '@/lib/admin/permissions';
import { auth } from '@/lib/auth';
import { clerkService } from '@/lib/clerk';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import type { AdminOrganization } from '@/lib/types';

/**
 * GET /api/admin/organizations
 * Get all organizations with aggregated metrics (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    // Check super admin access
    const isAdmin = await isSuperAdminByUserId(userId);
    if (!isAdmin) {
      return ApiErrorHandler.forbidden();
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type'); // 'personal' | 'team'
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // Fetch all organizations from Clerk
    const { data: clerkOrgs } = await clerkService.listOrganizations({
      limit: 1000, // Fetch all for now, we'll filter client-side
      offset: 0,
    });

    // Filter by search and type
    let filteredOrgs = clerkOrgs;

    if (search) {
      filteredOrgs = filteredOrgs.filter(org =>
        org.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (type === 'personal') {
      filteredOrgs = filteredOrgs.filter(org => org.isPersonal);
    } else if (type === 'team') {
      filteredOrgs = filteredOrgs.filter(org => !org.isPersonal);
    }

    // Get all org IDs for database queries
    const orgIds = filteredOrgs.map(org => org.id);

    // Aggregate metrics for all organizations
    const orgMetricsPromises = orgIds.map(async orgId => {
      // Get projects count
      const [projectsResult] = await db
        .select({ count: count() })
        .from(projects)
        .where(eq(projects.orgId, orgId));

      // Get members count from Clerk
      const members = await clerkService.getOrganizationMembers(orgId);

      return {
        orgId,
        projectsCount: projectsResult?.count || 0,
        membersCount: members.data.length,
      };
    });

    const orgMetrics = await Promise.all(orgMetricsPromises);

    // Map metrics to organizations
    const orgsWithMetrics: AdminOrganization[] = filteredOrgs.map(org => {
      const metrics = orgMetrics.find(m => m.orgId === org.id);

      return {
        ...org,
        projectsCount: metrics?.projectsCount || 0,
        membersCount: metrics?.membersCount || 0,
      };
    });

    // Sort organizations
    const sortedOrgs = orgsWithMetrics.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'projectsCount':
          comparison = a.projectsCount - b.projectsCount;
          break;
        case 'membersCount':
          comparison = a.membersCount - b.membersCount;
          break;
        case 'createdAt':
        default:
          comparison = a.createdAt.getTime() - b.createdAt.getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOrgs = sortedOrgs.slice(startIndex, endIndex);

    return NextResponse.json({
      data: {
        organizations: paginatedOrgs,
        total: sortedOrgs.length,
        page,
        limit,
        totalPages: Math.ceil(sortedOrgs.length / limit),
      },
    });
  } catch (error) {
    console.error('[API /admin/organizations] Error fetching organizations:', error);
    return ApiErrorHandler.handle(error);
  }
}
