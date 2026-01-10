/**
 * Sandbox Manager
 * Manages sandbox container lifecycle using Docker SDK
 */

import { DockerClient, type ContainerCreateRequest } from '@docker/node-sdk';
import { eq } from 'drizzle-orm';

import { decrypt } from '@/lib/crypto';
import { db } from '@/lib/db/drizzle';
import { organizationApiKeys } from '@/lib/db/schema';
import { KOSUKE_BOT_EMAIL, KOSUKE_BOT_NAME } from '@/lib/github/installations';

import { SandboxClient } from './client';
import { getSandboxConfig } from './config';
import { createSandboxDatabase, dropSandboxDatabase } from './database';
import { generatePreviewHost, generateSandboxName } from './naming';
import type { SandboxCreateOptions, SandboxInfo } from './types';

/**
 * Get the Anthropic API key for an organization
 * Returns the org's custom key if set, otherwise returns system default
 * Note: ANTHROPIC_API_KEY is validated in instrumentation.ts at startup
 */
async function getAnthropicApiKey(orgId?: string): Promise<string> {
  const systemDefault = process.env.ANTHROPIC_API_KEY!;

  if (!orgId) {
    return systemDefault;
  }

  try {
    const apiKeyRecord = await db.query.organizationApiKeys.findFirst({
      where: eq(organizationApiKeys.orgId, orgId),
    });

    if (apiKeyRecord?.anthropicApiKey) {
      const decryptedKey = decrypt(apiKeyRecord.anthropicApiKey);
      console.log(`🔑 Using custom Anthropic API key for org ${orgId}`);
      return decryptedKey;
    }
  } catch (error) {
    console.error(`Failed to fetch org API key for ${orgId}:`, error);
  }

  return systemDefault;
}

export class SandboxManager {
  private client: DockerClient | null = null;
  private config = getSandboxConfig();

  /**
   * Initialize Docker client
   */
  private async ensureClient(): Promise<DockerClient> {
    if (!this.client) {
      try {
        this.client = await DockerClient.fromDockerConfig();
        console.log('🐳 Docker client initialized for SandboxManager');
      } catch (error) {
        console.error('Failed to initialize Docker client:', error);
        throw new Error(
          `Failed to initialize Docker client: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
    return this.client;
  }

  /**
   * Pick a random port from the configured range (for local development)
   */
  private pickRandomPort(): number {
    const range = this.config.portRangeEnd - this.config.portRangeStart + 1;
    return Math.floor(Math.random() * range) + this.config.portRangeStart;
  }

  /**
   * Prepare routing configuration based on mode (Traefik vs local port)
   */
  private prepareRouting(
    sessionId: string,
    containerName: string
  ): { externalUrl: string; hostPort: number | null; labels: Record<string, string> } {
    if (this.config.traefikEnabled) {
      const previewHost = generatePreviewHost(sessionId, this.config.previewDomain);

      return {
        externalUrl: `https://${previewHost}`,
        hostPort: null,
        labels: {
          'traefik.enable': 'true',
          [`traefik.http.routers.${containerName}.rule`]: `Host(\`${previewHost}\`)`,
          [`traefik.http.routers.${containerName}.entrypoints`]: 'websecure',
          [`traefik.http.routers.${containerName}.tls.certresolver`]: 'letsencrypt',
          [`traefik.http.services.${containerName}.loadbalancer.server.port`]: String(
            this.config.bunPort
          ),
        },
      };
    }

    // Local mode: use port mapping
    const hostPort = this.pickRandomPort();

    return {
      externalUrl: `http://localhost:${hostPort}`,
      hostPort,
      labels: {
        'kosuke.host_port': String(hostPort),
      },
    };
  }

  /**
   * Create and start a sandbox container
   * Supports three modes:
   * - 'full': Agent + Bun + Python services (interactive development)
   * - 'agent-only': Only agent service (for API operations)
   * - 'command': Ephemeral command execution (runs command and exits)
   */
  async createSandbox(options: SandboxCreateOptions): Promise<SandboxInfo> {
    const client = await this.ensureClient();
    const containerName = generateSandboxName(options.sessionId);
    const isCommandMode = options.servicesMode === 'command';

    console.log(`🚀 Creating sandbox: ${containerName}`);
    console.log(`   Session: ${options.sessionId}`);
    console.log(`   Mode: ${options.mode}`);
    console.log(`   Services mode: ${options.servicesMode}`);
    console.log(`   Repo: ${options.repoUrl}`);
    console.log(`   Branch: ${options.branchName}`);
    if (isCommandMode && options.command) {
      console.log(`   Command: ${options.command.join(' ')}`);
    }

    // For command mode, always delete existing container first
    // For other modes, try to reuse existing container
    if (isCommandMode) {
      try {
        await client.containerDelete(containerName, { force: true, volumes: true });
        console.log(`🗑️ Removed existing container ${containerName}`);
      } catch {
        // Container doesn't exist, continue
      }
    } else {
      // Check if container already exists (non-command modes)
      try {
        const existing = await client.containerInspect(containerName);
        if (existing.State?.Running) {
          console.log(`✅ Sandbox ${containerName} already running`);
          return this.getSandboxInfo(containerName);
        }

        // Container exists but stopped
        const existingMode = existing.Config?.Labels?.['kosuke.mode'];

        if (existingMode === 'production') {
          // Production mode: always destroy and recreate to ensure fresh build
          console.log(`🔄 Production sandbox stopped, destroying and recreating...`);
          await client.containerDelete(containerName, { force: true, volumes: true });
          // Continue to create new container below
        } else {
          // Development mode: restart and pull latest code
          console.log(`🔄 Restarting stopped sandbox ${containerName}`);
          try {
            await client.containerStart(existing.Id!);
            console.log(`✅ Sandbox ${containerName} restarted`);

            // Pull latest code with fresh token
            console.log(`📥 Pulling latest code for branch ${options.branchName}...`);
            const agentReady = await this.waitForAgent(options.sessionId);

            if (agentReady && options.branchName && options.githubToken) {
              const sandboxClient = new SandboxClient(options.sessionId);
              const pullResult = await sandboxClient.pull(options.branchName, options.githubToken);

              if (pullResult.success) {
                console.log(
                  `✅ Code updated: ${pullResult.changed ? 'changes pulled' : 'already up to date'}`
                );
              } else {
                console.warn(`⚠️ Pull failed: ${pullResult.error}`);
              }
            }

            return this.getSandboxInfo(containerName);
          } catch (startError) {
            // If restart fails, remove and recreate
            console.log(`⚠️ Restart failed, recreating sandbox: ${startError}`);
            await client.containerDelete(containerName, { force: true, volumes: true });
          }
        }
      } catch {
        // Container doesn't exist, continue to create
      }
    }

    // Pull latest image
    try {
      console.log(`📦 Pulling sandbox image: ${this.config.sandboxImage}`);
      await client.imageCreate({ fromImage: this.config.sandboxImage }).wait();
    } catch (error) {
      console.warn(`⚠️ Failed to pull image, using local: ${error}`);
    }

    // Create Postgres database for this sandbox
    const postgresUrl = await createSandboxDatabase(options.sessionId);

    // Prepare routing configuration (Traefik vs local port)
    // Only expose bun port when servicesMode is 'full'
    let externalUrl: string | null = null;
    let hostPort: number | null = null;
    let routingLabels: Record<string, string> = {};

    if (options.servicesMode === 'full') {
      const routing = this.prepareRouting(options.sessionId, containerName);
      externalUrl = routing.externalUrl;
      hostPort = routing.hostPort;
      routingLabels = routing.labels;
    }

    const labels: Record<string, string> = {
      'kosuke.type': isCommandMode ? 'command' : 'sandbox',
      'kosuke.project_id': options.projectId,
      'kosuke.session_id': options.sessionId,
      'kosuke.mode': options.mode,
      'kosuke.services_mode': options.servicesMode,
      ...(options.branchName && { 'kosuke.branch': options.branchName }),
      ...(options.orgId && { 'kosuke.org_id': options.orgId }),
      ...(isCommandMode && options.command && { 'kosuke.command': options.command.join(' ') }),
      ...routingLabels,
    };

    // Get Anthropic API key (org custom key or system default)
    const anthropicApiKey = await getAnthropicApiKey(options.orgId);

    // Build base environment variables
    const envVars: string[] = [
      `KOSUKE_REPO_URL=${options.repoUrl}`,
      `KOSUKE_BRANCH=${options.branchName}`,
      `KOSUKE_GITHUB_TOKEN=${options.githubToken}`,
      `KOSUKE_MODE=${options.mode}`,
      `KOSUKE_SERVICES_MODE=${options.servicesMode}`,
      `KOSUKE_POSTGRES_URL=${postgresUrl}`,
      `KOSUKE_EXTERNAL_URL=${externalUrl}`,
      `KOSUKE_AGENT_PORT=${this.config.agentPort}`,
      `KOSUKE_ORG_ID=${options.orgId}`,
      `KOSUKE_PROJECT_ID=${options.projectId}`,
      `KOSUKE_SESSION_ID=${options.sessionId}`,
      `SANDBOX_BUN_PORT=${this.config.bunPort}`,
      `SANDBOX_PYTHON_PORT=${this.config.pythonPort}`,
      `ANTHROPIC_API_KEY=${anthropicApiKey}`,
      `GOOGLE_API_KEY=${process.env.GOOGLE_API_KEY || ''}`,
      `ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL}`,
      `GOOGLE_MODEL=${process.env.GOOGLE_MODEL}`,
      `AGENT_MAX_TURNS=${process.env.AGENT_MAX_TURNS || '25'}`,
      `LANGFUSE_SECRET_KEY=${process.env.LANGFUSE_SECRET_KEY || ''}`,
      `LANGFUSE_PUBLIC_KEY=${process.env.LANGFUSE_PUBLIC_KEY || ''}`,
      `LANGFUSE_BASE_URL=${process.env.LANGFUSE_BASE_URL || ''}`,
      // Git identity for sandbox commits - uses Kosuke Bot identity
      `KOSUKE_GIT_NAME=${KOSUKE_BOT_NAME}`,
      `KOSUKE_GIT_EMAIL=${KOSUKE_BOT_EMAIL}`,
      // Pass __KSK__* resolved values (same name as placeholder)
      `__KSK__PREVIEW_RESEND_API_KEY=${process.env.PREVIEW_RESEND_API_KEY || ''}`,
      // Render deployment credentials
      `RENDER_API_KEY=${process.env.RENDER_API_KEY || ''}`,
      `RENDER_OWNER_ID=${process.env.RENDER_OWNER_ID || ''}`,
    ];

    // Add command-specific env vars
    if (isCommandMode && options.commandEnv) {
      for (const [key, value] of Object.entries(options.commandEnv)) {
        envVars.push(`${key}=${value}`);
      }
    }

    // Container configuration
    // Note: Agent port is only accessed via Docker network, not exposed to host
    const containerConfig: ContainerCreateRequest = {
      Image: this.config.sandboxImage,
      Cmd: isCommandMode && options.command ? options.command : undefined,
      Env: envVars,
      Labels: labels,
      WorkingDir: isCommandMode ? '/app/project' : undefined,
      ExposedPorts: hostPort
        ? {
            [`${this.config.bunPort}/tcp`]: {},
          }
        : undefined,
      HostConfig: {
        NetworkMode: this.config.networkName,
        // TODO: restore limits
        // Memory: this.config.memoryLimit,
        // CpuShares: this.config.cpuShares,
        // PidsLimit: this.config.pidsLimit,
        PortBindings: hostPort
          ? {
              [`${this.config.bunPort}/tcp`]: [{ HostPort: String(hostPort) }],
            }
          : undefined,
        Binds:
          !this.config.traefikEnabled && process.env.HOST_PROJECT_PATH
            ? [
                // Mount kosuke-cli source for hot-reload in local development (rw for npm link)
                `${process.env.HOST_PROJECT_PATH}/sandbox/kosuke-cli:/app/kosuke-cli`,
              ]
            : undefined,
      },
    };

    // Create container
    console.log(`📦 Creating container ${containerName}...`);
    const createResult = await client.containerCreate(containerConfig, { name: containerName });

    // Start container
    console.log(`▶️ Starting container ${containerName}...`);
    await client.containerStart(createResult.Id);

    console.log(`✅ Sandbox ${containerName} started`);
    console.log(`   Services mode: ${options.servicesMode}`);
    if (externalUrl) {
      console.log(`   Preview URL: ${externalUrl}`);
    }

    // For command mode: wait for completion and return exit code
    if (isCommandMode) {
      return this.waitForCommandCompletion(
        client,
        createResult.Id,
        containerName,
        options.sessionId,
        options.mode,
        options.branchName,
        options.commandTimeout ?? 60 * 60 * 1000 // Default: 1 hour
      );
    }

    return this.getSandboxInfo(containerName);
  }

  /**
   * Wait for a command container to complete
   * Streams logs in real-time and returns SandboxInfo with exitCode
   */
  private async waitForCommandCompletion(
    client: DockerClient,
    containerId: string,
    containerName: string,
    sessionId: string,
    mode: 'development' | 'production',
    branch: string,
    timeout: number
  ): Promise<SandboxInfo> {
    // Stream logs in real-time
    console.log(`📋 Container logs:`);
    console.log('-'.repeat(60));

    // Create writable streams for stdout and stderr
    const { Writable } = await import('node:stream');

    const createLogStream = () =>
      new Writable({
        write(chunk, _encoding, callback) {
          const text = chunk.toString();
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              console.log(`   ${line}`);
            }
          }
          callback();
        },
      });

    const stdout = createLogStream();
    const stderr = createLogStream();

    // Start log streaming in background
    const logPromise = client
      .containerLogs(containerId, stdout, stderr, {
        follow: true,
        timestamps: false,
      })
      .catch(() => {
        // Stream ended or container stopped
      });

    // Wait for container to finish (with timeout)
    const startTime = Date.now();
    let exitCode = -1;

    while (true) {
      // Check if timeout exceeded
      if (Date.now() - startTime > timeout) {
        console.log('-'.repeat(60));
        console.error(`❌ Command timed out after ${timeout / 1000}s`);
        try {
          await client.containerStop(containerId, { timeout: 5 });
        } catch {
          // Ignore stop errors
        }
        // Keep container for manual cleanup/debugging
        console.log(`   Debug: docker exec -it ${containerName} bash`);
        console.log(`   Logs:  docker logs ${containerName}`);
        console.log(`   Remove: docker rm -f ${containerName}`);
        throw new Error(`Command timed out after ${timeout / 1000}s`);
      }

      // Check container status
      const inspect = await client.containerInspect(containerId);
      const state = inspect.State;

      if (!state?.Running) {
        exitCode = state?.ExitCode ?? -1;
        // Wait for log stream to finish
        await logPromise;
        console.log('-'.repeat(60));
        console.log(`✅ Container exited with code: ${exitCode}`);
        break;
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Keep container for manual cleanup (same as other modes)
    console.log(`✅ Command container completed: exit code ${exitCode}`);
    console.log(`   Debug: docker exec -it ${containerName} bash`);
    console.log(`   Logs:  docker logs ${containerName}`);
    console.log(`   Remove: docker rm -f ${containerName}`);

    return {
      containerId,
      name: containerName,
      sessionId,
      status: exitCode === 0 ? 'completed' : 'error',
      url: null,
      mode,
      branch,
      exitCode,
    };
  }

  /**
   * Get sandbox info by container name
   */
  private async getSandboxInfo(containerName: string): Promise<SandboxInfo> {
    const client = await this.ensureClient();
    const container = await client.containerInspect(containerName);

    const sessionId = container.Config?.Labels?.['kosuke.session_id'] || '';
    const mode = (container.Config?.Labels?.['kosuke.mode'] || 'development') as
      | 'development'
      | 'production';
    const branch = container.Config?.Labels?.['kosuke.branch'] || 'main';
    const servicesMode = container.Config?.Labels?.['kosuke.services_mode'] || 'full';
    const hostPort = container.Config?.Labels?.['kosuke.host_port'];

    // URL is null when servicesMode is 'agent-only' (no bun service)
    let url: string | null = null;
    if (servicesMode === 'full') {
      url = this.config.traefikEnabled
        ? `https://${generatePreviewHost(sessionId, this.config.previewDomain)}`
        : `http://localhost:${hostPort}`;
    }

    return {
      containerId: container.Id!,
      name: containerName,
      sessionId,
      status: container.State?.Running ? 'running' : 'stopped',
      url,
      mode,
      branch,
    };
  }

  /**
   * Get sandbox info by session ID
   */
  async getSandbox(sessionId: string): Promise<SandboxInfo | null> {
    const containerName = generateSandboxName(sessionId);

    try {
      return await this.getSandboxInfo(containerName);
    } catch {
      return null;
    }
  }

  /**
   * Stop a sandbox container (can be restarted)
   */
  async stopSandbox(sessionId: string): Promise<void> {
    const client = await this.ensureClient();
    const containerName = generateSandboxName(sessionId);

    try {
      console.log(`⏹️ Stopping sandbox ${containerName}...`);
      await client.containerStop(containerName, { timeout: 10 });
      console.log(`✅ Sandbox ${containerName} stopped`);
    } catch (err) {
      console.error(`Failed to stop sandbox ${containerName}:`, err);
      throw err;
    }
  }

  /**
   * Destroy a sandbox container (removes container, volumes, and database)
   */
  async destroySandbox(sessionId: string): Promise<void> {
    const client = await this.ensureClient();
    const containerName = generateSandboxName(sessionId);

    try {
      console.log(`🗑️ Destroying sandbox ${containerName}...`);

      // Try to stop first
      try {
        await client.containerStop(containerName, { timeout: 5 });
      } catch {
        // Container might already be stopped
      }

      // Remove container and volumes
      await client.containerDelete(containerName, { force: true, volumes: true });
      console.log(`✅ Sandbox ${containerName} destroyed`);

      // Drop the database
      await dropSandboxDatabase(sessionId);
    } catch (err) {
      console.error(`Failed to destroy sandbox ${containerName}:`, err);
      throw err;
    }
  }

  /**
   * Wait for the sandbox agent to be ready
   * Polls /agent/health and checks alive && ready flags
   */
  async waitForAgent(sessionId: string, maxAttempts: number = 30): Promise<boolean> {
    const agentUrl = this.getSandboxAgentUrl(sessionId);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${agentUrl}/agent/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          const health = await response.json();
          if (health.alive && health.ready) {
            console.log(`✅ Agent is ready (attempt ${attempt})`);
            return true;
          }
          console.log(
            `⏳ Agent responding but not ready yet (attempt ${attempt}): alive=${health.alive}, ready=${health.ready}`
          );
        }
      } catch {
        // Agent not ready yet - container might still be starting
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.warn(`⚠️ Agent not ready after ${maxAttempts} attempts`);
    return false;
  }

  /**
   * Update sandbox with latest code
   *
   * - Development mode: just pull (dev server has hot-reload)
   * - Production mode: pull then restart (needs rebuild)
   *
   * @param sessionId - Session ID
   * @param options - branch and githubToken to pull latest code
   */
  async updateSandbox(
    sessionId: string,
    options: { branch: string; githubToken: string }
  ): Promise<void> {
    const client = await this.ensureClient();
    const containerName = generateSandboxName(sessionId);

    try {
      // Get sandbox mode
      const sandbox = await this.getSandboxInfo(containerName);
      const isProduction = sandbox.mode === 'production';

      // Pull latest code
      console.log(`📥 Pulling latest code for branch ${options.branch}...`);
      const sandboxClient = new SandboxClient(sessionId);
      const pullResult = await sandboxClient.pull(options.branch, options.githubToken);

      if (pullResult.success) {
        console.log(
          `✅ Code updated: ${pullResult.changed ? 'changes pulled' : 'already up to date'}`
        );
      } else {
        console.warn(`⚠️ Pull failed: ${pullResult.error}`);
        return;
      }

      // Production mode: restart to trigger rebuild
      // Development mode: hot-reload picks up changes automatically
      if (isProduction) {
        console.log(`🔄 Restarting production sandbox ${containerName} for rebuild...`);
        await client.containerRestart(containerName, { timeout: 10 });
        console.log(`✅ Sandbox ${containerName} restarted`);
      } else {
        console.log(`✅ Development sandbox updated (hot-reload will pick up changes)`);
      }
    } catch (err) {
      console.error(`Failed to update sandbox ${containerName}:`, err);
      throw err;
    }
  }

  /**
   * Get sandbox agent URL for API calls
   */
  getSandboxAgentUrl(sessionId: string): string {
    const containerName = generateSandboxName(sessionId);
    return `http://${containerName}:${this.config.agentPort}`;
  }

  /**
   * List all sandboxes for a project
   */
  async listProjectSandboxes(projectId: string): Promise<SandboxInfo[]> {
    const client = await this.ensureClient();

    const containers = await client.containerList({ all: true });
    const projectContainers = containers.filter(container => {
      const labels = container.Labels || {};
      return labels['kosuke.type'] === 'sandbox' && labels['kosuke.project_id'] === projectId;
    });

    const sandboxes: SandboxInfo[] = [];

    for (const container of projectContainers) {
      const name = container.Names?.[0]?.replace(/^\//, '') || '';
      try {
        const info = await this.getSandboxInfo(name);
        sandboxes.push(info);
      } catch {
        // Skip containers we can't inspect
      }
    }

    return sandboxes;
  }

  /**
   * Destroy all sandboxes for a project
   */
  async destroyAllProjectSandboxes(
    projectId: string
  ): Promise<{ destroyed: number; failed: number }> {
    const sandboxes = await this.listProjectSandboxes(projectId);

    let destroyed = 0;
    let failed = 0;

    for (const sandbox of sandboxes) {
      try {
        await this.destroySandbox(sandbox.sessionId);
        destroyed++;
      } catch {
        failed++;
      }
    }

    return { destroyed, failed };
  }
}

// Singleton instance
let sandboxManagerInstance: SandboxManager | null = null;

/**
 * Get the singleton SandboxManager instance
 */
export function getSandboxManager(): SandboxManager {
  if (!sandboxManagerInstance) {
    console.log('🏗️ Initializing SandboxManager singleton...');
    sandboxManagerInstance = new SandboxManager();
  }
  return sandboxManagerInstance;
}
