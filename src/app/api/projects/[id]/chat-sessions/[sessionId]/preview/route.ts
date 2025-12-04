import { NextRequest, NextResponse } from 'next/server';

import { ApiErrorHandler } from '@/lib/api/errors';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { getProjectEnvironmentVariables } from '@/lib/db/queries';
import { chatSessions } from '@/lib/db/schema';
import { getPreviewService } from '@/lib/previews';
import { verifyProjectAccess } from '@/lib/projects';
import { and, eq } from 'drizzle-orm';

/**
 * GET /api/projects/[id]/chat-sessions/[sessionId]/preview
 * Get the preview URL for a project session
 * Automatically starts the preview if it's not running
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return ApiErrorHandler.unauthorized();
    }

    const { id: projectId, sessionId } = await params;

    // Verify user has access to project through organization membership
    const { hasAccess, project } = await verifyProjectAccess(userId, projectId);

    if (!hasAccess || !project) {
      return ApiErrorHandler.projectNotFound();
    }

    // Look up the session
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.projectId, projectId),
          eq(chatSessions.sessionId, sessionId)
        )
      );

    if (!session) {
      return ApiErrorHandler.chatSessionNotFound();
    }

    // Update lastActivityAt to track preview usage for cleanup job
    await db
      .update(chatSessions)
      .set({ lastActivityAt: new Date() })
      .where(eq(chatSessions.id, session.id));

    // Use singleton PreviewService instance
    const previewService = getPreviewService();
    const status = await previewService.getPreviewStatus(projectId, sessionId);

    // If container is not running, automatically start it
    if (!status.running && status.url === null) {
      console.log('Container is not running, starting preview...');

      // Fetch user-defined environment variables for the project
      const envVars = await getProjectEnvironmentVariables(projectId);

      // Start preview
      const url = await previewService.startPreview(
        projectId,
        sessionId,
        envVars,
        userId
      );

      // Get updated status
      const updatedStatus = await previewService.getPreviewStatus(projectId, sessionId);

      return NextResponse.json({
        success: true,
        url,
        previewUrl: url,
        project_id: projectId,
        session_id: sessionId,
        running: updatedStatus.running,
        is_responding: updatedStatus.is_responding,
        status: updatedStatus.is_responding ? 'running' : 'starting',
      });
    }

    // Container is already running, return status
    return NextResponse.json({
      ...status,
      success: true,
      previewUrl: status.url || null,
      status: status.is_responding ? 'running' : 'starting',
    });
  } catch (error: unknown) {
    console.error('Error in preview GET:', error);
    return ApiErrorHandler.handle(error);
  }
}
