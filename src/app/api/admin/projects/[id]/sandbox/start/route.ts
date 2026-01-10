import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { chatSessions, projects } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { getSandboxManager } from '@/lib/sandbox';

/**
 * POST /api/admin/projects/[id]/sandbox/start
 * Start sandbox for a project (agent-only mode)
 * Requires super admin access
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id: projectId } = await params;

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get default chat session
    const defaultSession = await db.query.chatSessions.findFirst({
      where: and(eq(chatSessions.projectId, projectId), eq(chatSessions.isDefault, true)),
    });
    if (!defaultSession) {
      return NextResponse.json({ error: 'No default chat session found' }, { status: 400 });
    }

    // Get GitHub token
    const githubToken = await getProjectGitHubToken(project);
    if (!githubToken) {
      return NextResponse.json({ error: 'GitHub token not available' }, { status: 500 });
    }

    const repoUrl =
      project.githubRepoUrl ||
      `https://github.com/${project.githubOwner}/${project.githubRepoName}`;

    // Start sandbox
    const sandboxManager = getSandboxManager();
    const sandbox = await sandboxManager.createSandbox({
      projectId,
      sessionId: defaultSession.id,
      branchName: defaultSession.branchName,
      repoUrl,
      githubToken,
      mode: 'production',
      servicesMode: 'agent-only',
      orgId: project.orgId ?? undefined,
    });

    console.log(`[API /admin/sandbox/start] ✅ Sandbox started for project ${projectId}`);

    return NextResponse.json({ success: true, sandbox });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/sandbox/start] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to start sandbox',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
