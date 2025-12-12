import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { chatSessions, projects } from '@/lib/db/schema';
import { ilike, eq, and, or, gte, lte, desc, asc, count } from 'drizzle-orm';

/**
 * GET /api/admin/chat-sessions
 * Get all chat sessions across all projects (super admin only)
 * Supports: search, status filter, project filter, date range, pagination, sorting
 */
export async function GET(request: NextRequest) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const projectId = searchParams.get('projectId');
    const userId = searchParams.get('userId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const sortBy = searchParams.get('sortBy') || 'lastActivityAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build query conditions
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(chatSessions.title, `%${search}%`),
          ilike(chatSessions.description, `%${search}%`),
          ilike(chatSessions.sessionId, `%${search}%`)
        )
      );
    }

    if (status && status !== 'all') {
      conditions.push(eq(chatSessions.status, status));
    }

    if (projectId) {
      conditions.push(eq(chatSessions.projectId, projectId));
    }

    if (userId) {
      conditions.push(eq(chatSessions.userId, userId));
    }

    if (dateFrom) {
      conditions.push(gte(chatSessions.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      // Include the entire end date
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(chatSessions.createdAt, endDate));
    }

    // Get total count
    const totalResult = await db
      .select({ count: count() })
      .from(chatSessions)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const total = totalResult[0]?.count || 0;

    // Determine sort column and order
    let sortColumn;
    switch (sortBy) {
      case 'title':
        sortColumn = chatSessions.title;
        break;
      case 'messageCount':
        sortColumn = chatSessions.messageCount;
        break;
      case 'createdAt':
        sortColumn = chatSessions.createdAt;
        break;
      default:
        sortColumn = chatSessions.lastActivityAt;
    }
    const orderFn = sortOrder === 'asc' ? asc : desc;

    // Fetch chat sessions with project information
    const chatSessionsList = await db
      .select({
        id: chatSessions.id,
        projectId: chatSessions.projectId,
        projectName: projects.name,
        userId: chatSessions.userId,
        title: chatSessions.title,
        description: chatSessions.description,
        sessionId: chatSessions.sessionId,
        remoteId: chatSessions.remoteId,
        status: chatSessions.status,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
        lastActivityAt: chatSessions.lastActivityAt,
        messageCount: chatSessions.messageCount,
        isDefault: chatSessions.isDefault,
        branchMergedAt: chatSessions.branchMergedAt,
        pullRequestNumber: chatSessions.pullRequestNumber,
      })
      .from(chatSessions)
      .leftJoin(projects, eq(chatSessions.projectId, projects.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset((page - 1) * limit);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        chatSessions: chatSessionsList,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching admin chat sessions:', error);

    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Failed to fetch chat sessions' }, { status: 500 });
  }
}
