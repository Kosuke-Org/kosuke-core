import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { chatSessions } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';

/**
 * POST /api/admin/chat-sessions/bulk
 * Perform bulk operations on chat sessions (super admin only)
 */
export async function POST(request: NextRequest) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const body = await request.json();
    const { action, sessionIds } = body as {
      action: 'delete' | 'updateStatus' | 'archive';
      sessionIds: string[];
      status?: string;
    };

    if (!action || !sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (action === 'delete') {
      // Delete chat sessions
      await db.delete(chatSessions).where(inArray(chatSessions.id, sessionIds));

      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${sessionIds.length} chat session(s)`,
      });
    }

    if (action === 'updateStatus') {
      const { status } = body;

      if (!status) {
        return NextResponse.json(
          { error: 'Status is required for updateStatus action' },
          { status: 400 }
        );
      }

      // Update chat session status
      await db.update(chatSessions).set({ status }).where(inArray(chatSessions.id, sessionIds));

      return NextResponse.json({
        success: true,
        message: `Successfully updated status for ${sessionIds.length} chat session(s)`,
      });
    }

    if (action === 'archive') {
      // Archive chat sessions (set status to archived)
      await db
        .update(chatSessions)
        .set({ status: 'archived' })
        .where(inArray(chatSessions.id, sessionIds));

      return NextResponse.json({
        success: true,
        message: `Successfully archived ${sessionIds.length} chat session(s)`,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error performing bulk operation:', error);

    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json(
        { error: 'Unauthorized - Super admin access required' },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: 'Failed to perform bulk operation' }, { status: 500 });
  }
}
