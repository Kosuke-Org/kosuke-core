import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { chatSessions } from '@/lib/db/schema';
import { verifyProjectAccess } from '@/lib/projects';
import { getSandboxManager } from '@/lib/sandbox';
import type { PreviewUrl, PreviewUrlsResponse } from '@/lib/types/preview-urls';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/projects/[id]/preview-urls
 * Get all preview URLs (sandboxes) for a project
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess) {
      return ApiErrorHandler.projectNotFound();
    }

    // Get all sandboxes for this project
    const sandboxManager = getSandboxManager();
    const sandboxes = await sandboxManager.listProjectSandboxes(projectId);

    // Get session info from database
    const sessions = await db
      .select({
        id: chatSessions.id,
        branchName: chatSessions.branchName,
        createdAt: chatSessions.createdAt,
        isDefault: chatSessions.isDefault,
      })
      .from(chatSessions)
      .where(eq(chatSessions.projectId, projectId));

    // Map session info by ID (UUID)
    const sessionInfoMap = new Map(
      sessions.map(s => [
        s.id,
        { branchName: s.branchName, createdAt: s.createdAt.toISOString(), isDefault: s.isDefault },
      ])
    );

    // Transform to PreviewUrl format
    const previewUrls: PreviewUrl[] = sandboxes.map(sandbox => {
      // sandbox.sessionId is the chat session UUID
      const sessionInfo = sessionInfoMap.get(sandbox.sessionId);

      return {
        id: sandbox.name,
        branch_name: sessionInfo?.branchName || 'unknown',
        full_url: sandbox.url,
        container_status: sandbox.status,
        created_at: sessionInfo?.createdAt || new Date().toISOString(),
      };
    });

    const response: PreviewUrlsResponse = {
      preview_urls: previewUrls,
      total_count: previewUrls.length,
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error fetching project preview URLs:', error);
    return ApiErrorHandler.serverError(error);
  }
}
