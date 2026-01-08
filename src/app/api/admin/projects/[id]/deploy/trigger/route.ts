import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { chatSessions, deployJobs, projects } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { deployQueue } from '@/lib/queue';
import { JOB_NAMES } from '@/lib/queue/config';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

/**
 * POST /api/admin/projects/[id]/deploy/trigger
 * Trigger deploy workflow for a project
 * Requires super admin access and project status must be 'active'
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { id: projectId } = await params;

    // Get project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify project status is 'active'
    if (project.status !== 'active') {
      return NextResponse.json(
        { error: `Project status must be 'active' to deploy. Current status: ${project.status}` },
        { status: 400 }
      );
    }

    // Get the default chat session for this project
    const defaultSession = await db.query.chatSessions.findFirst({
      where: and(eq(chatSessions.projectId, projectId), eq(chatSessions.isDefault, true)),
    });

    if (!defaultSession) {
      return NextResponse.json(
        { error: 'No default chat session found for this project' },
        { status: 400 }
      );
    }

    // Check if sandbox exists and is running, auto-start if not
    const sandboxManager = getSandboxManager();
    let sandbox = await sandboxManager.getSandbox(defaultSession.id);

    if (!sandbox || sandbox.status !== 'running') {
      console.log(
        `[API /admin/deploy/trigger] Sandbox not running for session ${defaultSession.id}, starting agent-only sandbox...`
      );

      const githubToken = await getProjectGitHubToken(project);
      if (!githubToken) {
        return NextResponse.json({ error: 'GitHub token not available' }, { status: 500 });
      }
      const repoUrl =
        project.githubRepoUrl ||
        `https://github.com/${project.githubOwner}/${project.githubRepoName}`;

      sandbox = await sandboxManager.createSandbox({
        projectId,
        sessionId: defaultSession.id,
        branchName: defaultSession.branchName,
        repoUrl,
        githubToken,
        mode: 'production',
        servicesMode: 'agent-only',
        orgId: project.orgId ?? undefined,
      });

      console.log(
        `[API /admin/deploy/trigger] Agent-only sandbox started for session ${defaultSession.id}`
      );
    }

    // Verify that kosuke.config.json has production configuration
    const sandboxClient = new SandboxClient(defaultSession.id);
    console.log(`[API /admin/deploy/trigger] Reading kosuke.config.json from sandbox...`);
    console.log(`[API /admin/deploy/trigger] Sandbox base URL: ${sandboxClient.getBaseUrl()}`);

    let rawContent: string | undefined;
    try {
      rawContent = await sandboxClient.readFile('kosuke.config.json');
      console.log(`[API /admin/deploy/trigger] Read config, length: ${rawContent.length} chars`);

      const config = JSON.parse(rawContent);
      console.log(
        `[API /admin/deploy/trigger] Parsed config keys: ${Object.keys(config).join(', ')}`
      );
      console.log(`[API /admin/deploy/trigger] Has production config: ${!!config.production}`);

      if (!config.production) {
        return NextResponse.json(
          {
            error:
              'Production configuration is missing in kosuke.config.json. Please configure deploy settings first.',
          },
          { status: 400 }
        );
      }

      console.log(
        `[API /admin/deploy/trigger] Production config: ${JSON.stringify(config.production).substring(0, 300)}`
      );
    } catch (error) {
      const isNotFound = error instanceof Error && error.message.includes('not found');

      if (isNotFound) {
        console.log(`[API /admin/deploy/trigger] Config file not found`);
        return NextResponse.json(
          {
            error: 'kosuke.config.json not found. Please configure the project first.',
          },
          { status: 400 }
        );
      }

      // Parse error - include detailed info
      let errorDetails = 'Unknown error';
      if (error instanceof SyntaxError) {
        errorDetails = `JSON parse error: ${error.message}`;
        console.error(`[API /admin/deploy/trigger] JSON parse error:`, error.message);
        console.error(
          `[API /admin/deploy/trigger] Raw content (first 500 chars):`,
          rawContent?.substring(0, 500)
        );
      } else if (error instanceof Error) {
        errorDetails = error.message;
        console.error(`[API /admin/deploy/trigger] Error:`, error.message);
      }

      return NextResponse.json(
        {
          error: `Failed to parse kosuke.config.json: ${errorDetails}`,
          details: error instanceof Error ? error.message : String(error),
          rawContent: rawContent?.substring(0, 500), // Include for debugging
        },
        { status: 400 }
      );
    }

    // Create deploy job in database
    const [deployJob] = await db
      .insert(deployJobs)
      .values({
        projectId,
        status: 'pending',
      })
      .returning();

    // Add job to queue
    await deployQueue.add(JOB_NAMES.PROCESS_DEPLOY, {
      deployJobId: deployJob.id,
      projectId,
      sessionId: defaultSession.id,
      cwd: '/app/project',
    });

    console.log(
      `[API /admin/deploy/trigger] ✅ Deploy job ${deployJob.id} created and queued for project ${projectId}`
    );

    return NextResponse.json({
      success: true,
      data: {
        jobId: deployJob.id,
        projectId: project.id,
        projectName: project.name,
        status: 'pending',
        message: 'Deploy workflow triggered successfully',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/deploy/trigger] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to trigger deploy workflow',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
