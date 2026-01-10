import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { requireSuperAdmin } from '@/lib/admin/permissions';
import { db } from '@/lib/db/drizzle';
import { chatSessions, projects } from '@/lib/db/schema';
import { getProjectGitHubToken } from '@/lib/github/installations';
import { getSandboxManager, SandboxClient } from '@/lib/sandbox';

// Full service config as expected by kosuke-cli
interface ProductionServiceConfig {
  type?: 'web' | 'worker';
  runtime?: 'node' | 'python';
  directory?: string;
  build_command?: string;
  start_command?: string;
  is_entrypoint?: boolean;
  external_connection_variable?: string;
}

// Full storage config as expected by kosuke-cli
interface ProductionStorageConfig {
  type?: 'postgres' | 'keyvalue' | 's3';
  connection_variable?: string;
  maxmemory_policy?: string;
  // S3-specific fields
  access_key_id_variable?: string;
  secret_access_key_variable?: string;
  bucket_variable?: string;
  region_variable?: string;
  endpoint_variable?: string;
}

interface ProductionConfig {
  services?: Record<string, ProductionServiceConfig>;
  storages?: Record<string, ProductionStorageConfig>;
  resources?: Record<string, { plan: string }>;
  environment?: Record<string, string>;
}

interface UpdateConfigBody {
  production: ProductionConfig;
}

/**
 * GET /api/admin/projects/[id]/deploy/config
 * Get the current kosuke.config.json configuration
 * Requires super admin access
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { id: projectId } = await params;

    // Verify project exists
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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
        `[API /admin/deploy/config GET] Sandbox not running for session ${defaultSession.id}, starting agent-only sandbox...`
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
        `[API /admin/deploy/config GET] Agent-only sandbox started for session ${defaultSession.id}`
      );
    }

    // Read kosuke.config.json from sandbox
    const sandboxClient = new SandboxClient(defaultSession.id);
    let rawContent: string | undefined;
    try {
      rawContent = await sandboxClient.readFile('kosuke.config.json');
      console.log(`[API /admin/deploy/config GET] Read config, length: ${rawContent.length} chars`);

      const config = JSON.parse(rawContent);
      console.log(
        `[API /admin/deploy/config GET] Parsed config keys: ${Object.keys(config).join(', ')}`
      );

      return NextResponse.json({
        hasConfig: true,
        config,
        hasProductionConfig: !!config.production,
      });
    } catch (error) {
      // File doesn't exist or couldn't be parsed
      const isNotFound = error instanceof Error && error.message.includes('not found');

      if (isNotFound) {
        console.log(`[API /admin/deploy/config GET] Config file not found`);
        return NextResponse.json({
          hasConfig: false,
          config: null,
          hasProductionConfig: false,
        });
      }

      // Parse error - include detailed info
      let errorDetails = 'Unknown parse error';
      if (error instanceof SyntaxError) {
        errorDetails = `JSON parse error: ${error.message}`;
        console.error(`[API /admin/deploy/config GET] JSON parse error:`, error.message);
        console.error(
          `[API /admin/deploy/config GET] Raw content (first 500 chars):`,
          rawContent?.substring(0, 500)
        );
      } else if (error instanceof Error) {
        errorDetails = error.message;
        console.error(`[API /admin/deploy/config GET] Error:`, error.message);
      }

      return NextResponse.json({
        hasConfig: true, // File exists but couldn't be parsed
        config: null,
        hasProductionConfig: false,
        error: `Failed to parse kosuke.config.json: ${errorDetails}`,
        rawContent: rawContent?.substring(0, 1000), // Include first 1000 chars for debugging
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/deploy/config GET] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to get deploy configuration',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/projects/[id]/deploy/config
 * Update the production section of kosuke.config.json
 * Requires super admin access
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check super admin access
    await requireSuperAdmin();

    const { id: projectId } = await params;
    const body: UpdateConfigBody = await request.json();

    if (!body.production) {
      return NextResponse.json({ error: 'Production configuration is required' }, { status: 400 });
    }

    // Verify project exists
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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
        `[API /admin/deploy/config PUT] Sandbox not running for session ${defaultSession.id}, starting agent-only sandbox...`
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
        `[API /admin/deploy/config PUT] Agent-only sandbox started for session ${defaultSession.id}`
      );
    }

    // Read current kosuke.config.json from sandbox
    const sandboxClient = new SandboxClient(defaultSession.id);
    let existingConfig: Record<string, unknown> = {};
    try {
      const configContent = await sandboxClient.readFile('kosuke.config.json');
      existingConfig = JSON.parse(configContent);
    } catch {
      // If file doesn't exist or parsing fails, start with empty config
    }

    // Merge production config - PRESERVE existing services/storages structure
    // The modal only allows editing plans (in resources) and environment vars
    // Service/storage configs (build_command, start_command, etc.) should come from existing config
    const existingProduction = (existingConfig.production || {}) as Record<string, unknown>;
    const existingServices = (existingProduction.services || {}) as Record<
      string,
      Record<string, unknown>
    >;
    const existingStorages = (existingProduction.storages || {}) as Record<
      string,
      Record<string, unknown>
    >;

    // Get incoming configs from modal
    const incomingServices = (body.production.services || {}) as Record<
      string,
      Record<string, unknown>
    >;
    const incomingStorages = (body.production.storages || {}) as Record<
      string,
      Record<string, unknown>
    >;

    // Merge services: PREFER existing config (has build_command, etc.), only update type/runtime if provided
    // Key insight: existing config from kosuke import has all required fields
    const allServiceKeys = new Set([
      ...Object.keys(existingServices),
      ...Object.keys(incomingServices),
    ]);
    const validatedServices = Object.fromEntries(
      Array.from(allServiceKeys).map(key => {
        const existing = existingServices[key] || {};
        const incoming = incomingServices[key] || {};

        // Merge: existing provides full config (build_command, etc.), incoming can override type/runtime
        const merged = {
          ...existing,
          ...incoming,
          // Ensure type and runtime are always set
          type: incoming.type || existing.type || 'web',
          runtime: incoming.runtime || existing.runtime || 'node',
        };

        return [key, merged];
      })
    );

    // Merge storages: same approach - preserve existing config fields
    const allStorageKeys = new Set([
      ...Object.keys(existingStorages),
      ...Object.keys(incomingStorages),
    ]);
    const validatedStorages = Object.fromEntries(
      Array.from(allStorageKeys).map(key => {
        const existing = existingStorages[key] || {};
        const incoming = incomingStorages[key] || {};

        const inferredType =
          key.toLowerCase().includes('redis') || key.toLowerCase() === 'keyvalue'
            ? 'keyvalue'
            : key.toLowerCase().includes('s3') ||
                key.toLowerCase() === 'storage' ||
                key.toLowerCase() === 'spaces'
              ? 's3'
              : 'postgres';

        // Merge: existing provides full config (connection_variable, etc.), incoming can override type
        const merged = {
          ...existing,
          ...incoming,
          type: incoming.type || existing.type || inferredType,
        };

        return [key, merged];
      })
    );

    const updatedConfig = {
      ...existingConfig,
      production: {
        services: validatedServices,
        storages: validatedStorages,
        // Update resources (plan selections) and environment from modal
        resources: body.production.resources || existingProduction.resources,
        environment: body.production.environment || existingProduction.environment,
      },
    };

    // Write updated config back to sandbox
    try {
      await sandboxClient.writeFile('kosuke.config.json', JSON.stringify(updatedConfig, null, 2));
      console.log(`[API /admin/deploy/config PUT] ✅ Written config to sandbox`);
    } catch (writeError) {
      console.error(`[API /admin/deploy/config PUT] ❌ Failed to write config:`, writeError);
      return NextResponse.json(
        {
          error: 'Failed to write kosuke.config.json',
          details: writeError instanceof Error ? writeError.message : String(writeError),
        },
        { status: 500 }
      );
    }

    // Commit the config file to git
    let commitSha: string | null = null;
    let commitSuccess = false;
    try {
      const githubToken = await getProjectGitHubToken(project);
      if (githubToken) {
        console.log(`[API /admin/deploy/config PUT] 📝 Committing config to git...`);
        const commitResult = await sandboxClient.commitDeployConfig(
          githubToken,
          'chore: update production configuration'
        );
        commitSuccess = commitResult.success;
        commitSha = commitResult.data?.sha ?? null;
        if (commitResult.success) {
          console.log(`[API /admin/deploy/config PUT] ✅ Committed config, SHA: ${commitSha}`);
        } else {
          console.warn(
            `[API /admin/deploy/config PUT] ⚠️ Failed to commit config:`,
            commitResult.error
          );
        }
      } else {
        console.warn(`[API /admin/deploy/config PUT] ⚠️ No GitHub token, skipping commit`);
      }
    } catch (commitError) {
      // Don't fail the whole operation if commit fails
      console.warn(`[API /admin/deploy/config PUT] ⚠️ Commit error (non-fatal):`, commitError);
    }

    console.log(
      `[API /admin/deploy/config PUT] ✅ Updated production config for project ${projectId}`
    );

    return NextResponse.json({
      success: true,
      config: updatedConfig,
      committed: commitSuccess,
      commitSha,
      message: commitSuccess
        ? 'Production configuration updated and committed to git'
        : 'Production configuration updated (commit skipped)',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Super admin access required') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('[API /admin/deploy/config PUT] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to update deploy configuration',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
