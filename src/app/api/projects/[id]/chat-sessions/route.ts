import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatSessions } from '@/lib/db/schema';
import { verifyProjectAccess } from '@/lib/projects';
import { and, desc, eq, inArray } from 'drizzle-orm';

// Schema for creating a chat session
const createChatSessionSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().optional(),
});

/**
 * Generate a random branch ID (5-6 alphanumeric characters)
 */
function generateBranchId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * GET /api/projects/[id]/chat-sessions
 * List all chat sessions for a project
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get optional status filter from query params
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const statuses = statusParam ? statusParam.split(',') : null;

    // Build query conditions
    const conditions = [eq(chatSessions.projectId, projectId)];

    // Add status filter if provided
    if (statuses && statuses.length > 0) {
      conditions.push(inArray(chatSessions.status, statuses));
    }

    // Get all chat sessions for the project
    const sessions = await db
      .select()
      .from(chatSessions)
      .where(and(...conditions))
      .orderBy(desc(chatSessions.lastActivityAt));

    return NextResponse.json({
      sessions,
      total: sessions.length,
    });
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    return ApiErrorHandler.handle(error);
  }
}

/**
 * POST /api/projects/[id]/chat-sessions
 * Create a new chat session with GitHub branch and draft PR
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Parse request body
    const body = await request.json();
    const parseResult = createChatSessionSchema.safeParse(body);

    if (!parseResult.success) {
      return ApiErrorHandler.validationError(parseResult.error);
    }

    const { title, description } = parseResult.data;

    // Get branch prefix from environment
    const branchPrefix = process.env.SESSION_BRANCH_PREFIX;

    // Generate branch name
    const branchId = generateBranchId();
    const branchName = `${branchPrefix}${branchId}`;

    // Create chat session
    const [newSession] = await db
      .insert(chatSessions)
      .values({
        projectId,
        userId,
        title,
        description,
        branchName,
        status: 'active',
        messageCount: 0,
        isDefault: false,
      })
      .returning();

    return NextResponse.json({
      session: newSession,
    });
  } catch (error) {
    console.error('Error creating chat session:', error);
    return ApiErrorHandler.handle(error);
  }
}
