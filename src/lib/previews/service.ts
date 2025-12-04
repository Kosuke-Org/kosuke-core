/**
 * Preview Service
 * Manages preview containers for preview environments
 */

import type { StorageConnectionInfo } from '@/lib/previews/storages';
import type { DockerContainerStatus, RouteInfo } from '@/lib/types/docker';
import type { ServiceConfig, ServiceType, StoragesConfig } from '@/lib/types/kosuke-config';
import { getEntrypointService } from '@/lib/types/kosuke-config';
import type { PreviewUrl, PreviewUrlsResponse } from '@/lib/types/preview-urls';
import { DockerClient, type ContainerCreateRequest } from '@docker/node-sdk';
import { join } from 'path';
import { getPreviewConfig } from './config';
import { buildEnviornment, readKosukeConfig } from './config-reader';
import { generatePreviewResourceName, sanitizeUUID } from './naming';
import { PortRouterAdapter, TraefikRouterAdapter, type RouterAdapter } from './router-adapters';
import { createPreviewStorages, dropPreviewStorages } from './storages';

class PreviewService {
  private client: DockerClient | null = null;
  private config;
  private adapter: RouterAdapter;
  private hostProjectsDir: string;

  constructor() {
    this.config = getPreviewConfig();

    this.hostProjectsDir = join(this.config.hostWorkspaceDir, 'projects');

    // Select router adapter based on configuration
    if (this.config.routerMode === 'traefik') {
      this.adapter = new TraefikRouterAdapter();
    } else {
      this.adapter = new PortRouterAdapter(
        this.config.previewPortRangeStart,
        this.config.previewPortRangeEnd
      );
    }

    console.log(`DockerService initialized with host projects directory: ${this.hostProjectsDir}`);
    console.log(`Router mode: ${this.config.routerMode}`);
  }

  /**
   * Initialize Docker client
   */
  private async ensureClient(): Promise<DockerClient> {
    if (!this.client) {
      try {
        this.client = await DockerClient.fromDockerConfig();
        console.log('Docker client initialized successfully');
      } catch (error) {
        console.error('Docker client initialization failed:', error);
        throw new Error(
          `Failed to initialize Docker client: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
    return this.client;
  }

  /**
   * Get container name for a service
   */
  private getContainerName(projectId: string, sessionId: string, serviceName: string): string {
    return generatePreviewResourceName(projectId, sessionId, serviceName);
  }

  /**
   * Get host session path (absolute path on host machine for Docker volume mounts)
   */
  private getHostSessionPath(projectId: string, sessionId: string): string {
    return join(this.hostProjectsDir, projectId, 'sessions', sessionId);
  }

  /**
   * Get container session path (path inside this Next.js container)
   */
  private getContainerSessionPath(projectId: string, sessionId: string): string {
    return join(process.cwd(), 'projects', projectId, 'sessions', sessionId);
  }

  /**
   * Get service-specific host path
   */
  private getHostServicePath(
    projectId: string,
    sessionId: string,
    serviceDirectory: string
  ): string {
    const sessionPath = this.getHostSessionPath(projectId, sessionId);
    return join(sessionPath, serviceDirectory);
  }

  /**
   * Get service-specific container path (path inside this Next.js container)
   */
  private getContainerServicePath(
    projectId: string,
    sessionId: string,
    serviceDirectory: string
  ): string {
    const sessionPath = this.getContainerSessionPath(projectId, sessionId);
    return join(sessionPath, serviceDirectory);
  }

  /**
   * Prepare environment variables for a service container
   */
  private prepareServiceEnvironment(
    configEnv: Record<string, string>,
    userEnvVars: Record<string, string>,
    serviceUrls: Record<string, string>,
    externalConnectionUrls: Record<string, string>,
    storageUrls: Record<string, string>
  ): string[] {
    // Priority: storageUrls > externalConnectionUrls > serviceUrls > userEnvVars > configEnv
    const environment = {
      ...configEnv,
      ...userEnvVars,
      ...serviceUrls,
      ...externalConnectionUrls,
      ...storageUrls,
    };

    // Convert to Docker format: ["KEY=value", ...]
    return Object.entries(environment).map(([key, value]) => `${key}=${value}`);
  }

  /**
   * Get preview image name for service type
   */
  private getPreviewImage(serviceType: ServiceType): string {
    switch (serviceType) {
      case 'bun':
        return this.config.bunPreviewImage;
      case 'python':
        return this.config.pythonPreviewImage;
      default:
        throw new Error(`Unsupported service type: ${serviceType}`);
    }
  }

  /**
   * Ensure preview image is available (always pulls to get latest version)
   */
  private async ensurePreviewImage(serviceType: ServiceType): Promise<void> {
    const imageName = this.getPreviewImage(serviceType);
    const client = await this.ensureClient();

    console.log(`Pulling preview image ${imageName}...`);
    try {
      await client.imageCreate({ fromImage: imageName }).wait();
      console.log(`Successfully pulled preview image ${imageName}`);
    } catch (pullError) {
      // Try to use local version if pull fails
      console.warn(`Failed to pull ${imageName}, checking for local version...`);
      try {
        await client.imageInspect(imageName);
        console.log(`Using local preview image ${imageName}`);
      } catch {
        throw new Error(
          `Failed to pull preview image ${imageName} and no local version available: ${pullError instanceof Error ? pullError.message : 'Unknown error'}`
        );
      }
    }
  }

  /**
   * Get existing container by name
   */
  private async getContainerByName(containerName: string) {
    try {
      const client = await this.ensureClient();
      const container = await client.containerInspect(containerName);
      return container;
    } catch {
      // Container not found
      return null;
    }
  }

  /**
   * Setup anonymous volumes for a service type
   * Creates placeholder directories to prevent Docker from creating them as root
   */
  private async setupAnonymousVolumes(
    serviceType: string,
    containerServicePath: string
  ): Promise<Record<string, object>> {
    const { mkdir } = await import('fs/promises');
    const { join } = await import('path');

    let volumePaths: string[] = [];

    switch (serviceType) {
      case 'bun':
        volumePaths = ['node_modules', '.next'];
        break;
      case 'python':
        volumePaths = ['.venv', '__pycache__'];
        break;
      default:
        return {};
    }

    // Create directories using container path (where Next.js has write access)
    for (const volumePath of volumePaths) {
      try {
        const fullPath = join(containerServicePath, volumePath);
        await mkdir(fullPath, { recursive: true });
        console.log(`✅ Created volume placeholder: ${fullPath}`);
      } catch (error) {
        // Don't fail if directory creation fails - Docker will create it
        console.warn(`⚠️ Failed to create ${volumePath} placeholder:`, error);
      }
    }

    // Return volume configuration for Docker
    const volumes: Record<string, object> = {};
    for (const volumePath of volumePaths) {
      volumes[`/app/${volumePath}`] = {};
    }

    return volumes;
  }

  /**
   * Create container configuration
   */
  private createContainerConfig(
    serviceType: ServiceType,
    environment: string[],
    hostServicePath: string,
    anonymousVolumes: Record<string, object>,
    routeInfo?: RouteInfo
  ): ContainerCreateRequest {
    const imageName = this.getPreviewImage(serviceType);

    const baseHostConfig = {
      Binds: [`${hostServicePath}:/app:rw`],
      NetworkMode: this.config.previewNetwork,
      AutoRemove: false,
    };

    const config: ContainerCreateRequest = {
      Image: imageName,
      Env: environment,
      Labels: routeInfo?.labels,
      WorkingDir: '/app',
      HostConfig: baseHostConfig,
      // Exclude dependency, cache, and build directories from bind mount (use anonymous volumes) to improve performance
      Volumes: anonymousVolumes,
    };

    // Add port bindings for port mode (only for entrypoint service)
    if (this.config.routerMode === 'port' && routeInfo?.port) {
      const containerPort = this.getServiceDefaultPort(serviceType);
      config.HostConfig = {
        ...baseHostConfig,
        PortBindings: {
          [`${containerPort}/tcp`]: [{ HostPort: String(routeInfo.port) }],
        },
      };
    }

    return config;
  }

  /**
   * Start a single service container
   */
  private async startServiceContainer(
    projectId: string,
    sessionId: string,
    serviceName: string,
    service: ServiceConfig,
    environment: string[],
    routeInfo?: RouteInfo
  ): Promise<string | null> {
    const containerName = this.getContainerName(projectId, sessionId, serviceName);
    const hostServicePath = this.getHostServicePath(projectId, sessionId, service.directory);
    const containerServicePath = this.getContainerServicePath(
      projectId,
      sessionId,
      service.directory
    );

    // Ensure image is available
    await this.ensurePreviewImage(service.type);

    const client = await this.ensureClient();

    // Setup anonymous volumes (creates placeholder directories to prevent root ownership)
    const anonymousVolumes = await this.setupAnonymousVolumes(service.type, containerServicePath);

    console.log(
      `Starting service ${serviceName} (${service.type}) as ${containerName}` +
        `${routeInfo ? ` with URL ${routeInfo.url}` : ' (internal only)'}`
    );

    try {
      // Check if container already exists (might be stopped)
      try {
        const existing = await client.containerInspect(containerName);
        const containerId = existing.Id!;

        if (existing.State?.Running) {
          console.log(`Container ${containerName} is already running`);
          return routeInfo?.url || null;
        }

        // Container exists but is stopped - start it
        console.log(`Container ${containerName} exists but is stopped, starting it...`);
        await client.containerStart(containerId);
        console.log(`✅ Successfully started existing container ${serviceName}`);
        return routeInfo?.url || null;
      } catch {
        // Container doesn't exist, create it
      }

      const config = this.createContainerConfig(
        service.type,
        environment,
        hostServicePath,
        anonymousVolumes,
        routeInfo
      );

      // Create and start container
      const createResponse = await client.containerCreate(config, { name: containerName });
      await client.containerStart(createResponse.Id);

      console.log(`✅ Successfully started service ${serviceName}`);
      return routeInfo?.url || null;
    } catch (error) {
      console.error(`Failed to start service ${serviceName}:`, error);
      // Clean up any partially created container and volumes
      try {
        await client.containerDelete(containerName, { force: true, volumes: true });
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Build storage URLs for all services
   * All services get all storage connection URLs
   */
  private extractStorageEnvVariables(
    storageConnections: Record<string, StorageConnectionInfo>,
    storages: StoragesConfig
  ): Record<string, string> {
    const storageUrls: Record<string, string> = {};

    for (const [storageName, storageConfig] of Object.entries(storages)) {
      const connectionInfo = storageConnections[storageName];
      if (!connectionInfo) {
        console.warn(`Storage ${storageName} was not created`);
        continue;
      }

      storageUrls[storageConfig.connection_variable] = connectionInfo.url;
    }

    return storageUrls;
  }

  /**
   * Get default port for a service type
   */
  private getServiceDefaultPort(serviceType: string): number {
    switch (serviceType) {
      case 'bun':
        return 3000;
      case 'python':
        return 8000;
      default:
        return 3000;
    }
  }

  /**
   * Build service connection URLs for inter-service communication
   * All services get connection URLs to all other services
   */
  private extractServiceConnectionUrls(
    projectId: string,
    sessionId: string,
    services: Record<string, ServiceConfig>
  ): Record<string, string> {
    const serviceUrls: Record<string, string> = {};

    for (const [serviceName, serviceConfig] of Object.entries(services)) {
      if (!serviceConfig.connection_variable) {
        continue;
      }

      const containerName = this.getContainerName(projectId, sessionId, serviceName);
      const defaultPort = this.getServiceDefaultPort(serviceConfig.type);
      const connectionUrl = `http://${containerName}:${defaultPort}`;

      serviceUrls[serviceConfig.connection_variable] = connectionUrl;
      console.log(`Service connection: ${serviceConfig.connection_variable} = ${connectionUrl}`);
    }

    return serviceUrls;
  }

  /**
   * Start preview for a multi-service project
   */
  async startPreview(
    projectId: string,
    sessionId: string,
    userEnvVars: Record<string, string> = {},
    userId: string
  ): Promise<string> {
    console.log(`Starting multi-service preview for project ${projectId} session ${sessionId}`);

    // Check Docker availability
    try {
      const client = await this.ensureClient();
      await client.systemPing();
    } catch (error) {
      console.error('Docker is not available:', error);
      throw new Error('Docker is not available');
    }

    // Ensure session directory exists (create and clone repo if needed)
    const { sessionManager } = await import('@/lib/sessions');
    await sessionManager.ensureSessionEnvironment(projectId, sessionId, userId);

    // Get container path to session directory (for reading config files)
    const containerSessionPath = this.getContainerSessionPath(projectId, sessionId);

    // Read kosuke.config.json from cloned repo
    const kosukeConfig = await readKosukeConfig(containerSessionPath);
    const { services, environment, storages } = kosukeConfig.preview;

    // Process special __KSK__ values in environment
    const configEnv = environment ? buildEnviornment(environment) : {};

    // Create storages
    console.log('Creating preview storages...');
    const client = await this.ensureClient();
    const storageConnections = await createPreviewStorages(
      projectId,
      sessionId,
      kosukeConfig,
      client,
      this.config.previewNetwork
    );

    // Extract storage URLs (all services get all storages)
    const storageEnvVars = storages
      ? this.extractStorageEnvVariables(storageConnections, storages)
      : {};

    // Extract service connection URLs (all services get URLs to all other services)
    const serviceConnectionUrls = this.extractServiceConnectionUrls(projectId, sessionId, services);

    // Find entrypoint service (throws if not found)
    const entrypointEntry = getEntrypointService(services);

    // Prepare route info ONCE for entrypoint service
    const entrypointContainerName = this.getContainerName(
      projectId,
      sessionId,
      entrypointEntry.name
    );
    const entrypointRouteInfo = this.adapter.prepareRun(
      projectId,
      sessionId,
      entrypointContainerName
    );

    // Generate external URL for entrypoint service (if it has external_connection_variable)
    const externalConnectionEnvVars: Record<string, string> = {};
    if (entrypointEntry.config.external_connection_variable) {
      externalConnectionEnvVars[entrypointEntry.config.external_connection_variable] =
        entrypointRouteInfo.url;
      console.log(
        `External connection: ${entrypointEntry.config.external_connection_variable} = ${entrypointRouteInfo.url}`
      );
    }

    // Start all services simultaneously
    const servicePromises: Promise<{ serviceName: string; url: string | null }>[] = [];

    for (const [serviceName, serviceConfig] of Object.entries(services)) {
      const isEntrypoint = serviceConfig.is_entrypoint === true;

      // Prepare environment: configEnv < userEnvVars < serviceConnectionUrls < externalConnectionEnvVars < storageEnvVars
      const environment = this.prepareServiceEnvironment(
        configEnv,
        userEnvVars,
        serviceConnectionUrls,
        externalConnectionEnvVars,
        storageEnvVars
      );

      // Add KOSUKE_MODE based on sessionId (main = production, others = development)
      const kosukeMode = sessionId === 'main' ? 'production' : 'development';
      environment.push(`KOSUKE_MODE=${kosukeMode}`);

      // Start service (pass entrypoint route info if this is the entrypoint)
      const startServicePromise = this.startServiceContainer(
        projectId,
        sessionId,
        serviceName,
        serviceConfig,
        environment,
        isEntrypoint ? entrypointRouteInfo : undefined
      ).then(url => ({ serviceName, url }));

      servicePromises.push(startServicePromise);
    }

    // Wait for all services to start
    try {
      const results = await Promise.all(servicePromises);

      // Find entrypoint URL
      const entrypointResult = results.find(r => r.serviceName === entrypointEntry.name);
      if (!entrypointResult || !entrypointResult.url) {
        throw new Error('Failed to start entrypoint service');
      }

      console.log(`✅ Multi-service preview started successfully at ${entrypointResult.url}`);
      return entrypointResult.url;
    } catch (error) {
      console.error('Failed to start some services, cleaning up...');
      // Cleanup on failure
      await this.stopPreview(projectId, sessionId, true);
      throw error;
    }
  }

  /**
   * Get preview status for entrypoint service
   */
  async getPreviewStatus(projectId: string, sessionId: string): Promise<DockerContainerStatus> {
    try {
      // Get container session path and read config
      const containerSessionPath = this.getContainerSessionPath(projectId, sessionId);

      const kosukeConfig = await readKosukeConfig(containerSessionPath);
      const { services } = kosukeConfig.preview;
      const entrypointEntry = getEntrypointService(services);

      const containerName = this.getContainerName(projectId, sessionId, entrypointEntry.name);
      const container = await this.getContainerByName(containerName);

      if (!container || !container.State?.Running) {
        return { running: false, url: null, is_responding: false };
      }

      const url = this.adapter.getContainerUrl(container);
      if (!url) {
        return { running: true, url: null, is_responding: false };
      }

      const isResponding = await this.checkContainerHealth(url);

      return { running: true, url, is_responding: isResponding };
    } catch (error) {
      // Only log errors that aren't expected "not found" scenarios
      // (e.g., deleted project, missing config file)
      const errorMessage = error instanceof Error ? error.message : '';
      const isExpectedNotFound =
        errorMessage.includes('kosuke.config.json not found') || errorMessage.includes('ENOENT');

      if (!isExpectedNotFound) {
        console.error('Error getting preview status:', error);
      }
      return { running: false, url: null, is_responding: false };
    }
  }

  /**
   * Check container health via HTTP
   */
  private async checkContainerHealth(url: string, timeout = 2000): Promise<boolean> {
    // Adjust for Docker-in-Docker - replace localhost with host.docker.internal
    const baseUrl = url.replace('localhost', 'host.docker.internal');
    const healthUrl = baseUrl.endsWith('/')
      ? `${baseUrl}${this.config.previewHealthPath.replace(/^\//, '')}`
      : `${baseUrl}${this.config.previewHealthPath}`;

    console.log(`Checking health of ${healthUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(healthUrl, {
        signal: controller.signal,
        method: 'GET',
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      console.log(`Health check failed for ${healthUrl}`);
      return false;
    }
  }

  /**
   * Stop or destroy all service containers for a preview
   * @param remove - if true, removes containers and volumes; if false, only stops them (can be restarted)
   */
  async stopPreview(projectId: string, sessionId: string, remove: boolean = false): Promise<void> {
    const action = remove ? 'Destroying' : 'Stopping';
    console.log(`${action} preview for project ${projectId} session ${sessionId}`);

    const containerSessionPath = this.getContainerSessionPath(projectId, sessionId);
    const kosukeConfig = await readKosukeConfig(containerSessionPath);
    const { services } = kosukeConfig.preview;

    const client = await this.ensureClient();

    // Stop (and optionally remove) all service containers
    for (const serviceName of Object.keys(services)) {
      const containerName = this.getContainerName(projectId, sessionId, serviceName);

      try {
        await client.containerStop(containerName, { timeout: 5 });
        console.log(`Stopped service ${serviceName}`);
      } catch (error) {
        console.log(`Failed to stop service ${serviceName}:`, error);
      }

      if (remove) {
        try {
          await client.containerDelete(containerName, { force: true, volumes: true });
          console.log(`Removed service ${serviceName} and its volumes`);
        } catch (error) {
          console.log(`Failed to remove service ${serviceName}:`, error);
        }
      }
    }

    // Handle storages (stop or drop based on remove flag)
    try {
      await dropPreviewStorages(projectId, sessionId, kosukeConfig, client, remove);
    } catch (error) {
      console.error('Failed to handle storages:', error);
    }

    console.log(`✅ Preview ${remove ? 'destroyed' : 'stopped'}`);
  }

  /**
   * Get all preview URLs for a project (for backward compatibility)
   */
  async getProjectPreviewUrls(projectId: string): Promise<PreviewUrlsResponse> {
    console.log(`📋 Getting preview URLs for project ${projectId}`);

    try {
      const client = await this.ensureClient();
      // Use sanitized projectId (underscores) to match actual container naming convention
      const namePrefix = `${this.config.previewContainerNamePrefix}${sanitizeUUID(projectId)}_`;

      const allContainers = await client.containerList({ all: true });
      const projectContainers = allContainers.filter(container => {
        const name = container.Names?.[0]?.replace(/^\//, '') || '';
        return name.startsWith(namePrefix);
      });

      // Group containers by session
      const sessionContainers = new Map<string, typeof projectContainers>();

      for (const container of projectContainers) {
        const containerName = container.Names?.[0]?.replace(/^\//, '') || '';
        // Extract session ID: prefix_projectId_sessionId_serviceName (underscores)
        const parts = containerName.replace(namePrefix, '').split('_');
        const sessionId = parts[0]; // First part after projectId

        if (!sessionContainers.has(sessionId)) {
          sessionContainers.set(sessionId, []);
        }
        sessionContainers.get(sessionId)!.push(container);
      }

      const previewUrls: PreviewUrl[] = [];

      // For each session, find entrypoint container
      for (const [sessionId, containers] of sessionContainers.entries()) {
        try {
          // Find entrypoint container (would need to inspect labels or config)
          // For now, use first running container
          const runningContainer = containers.find(c => c.State === 'running');
          const containerToUse = runningContainer || containers[0];

          if (!containerToUse) continue;

          const containerName = containerToUse.Names?.[0]?.replace(/^\//, '') || '';
          const containerDetails = await client.containerInspect(containerName);
          const fullUrl = this.adapter.getContainerUrl(containerDetails);

          if (!fullUrl) continue;

          const labels = containerDetails.Config?.Labels || {};
          const branchName = labels['kosuke.branch'] || labels['kosuke.session_id'] || sessionId;

          let subdomain: string | null = null;
          if (fullUrl.startsWith('https://')) {
            const domain = fullUrl.replace('https://', '').split('/')[0];
            subdomain = domain.split('.')[0];
          }

          const rawStatus = containerToUse.State || 'unknown';
          let containerStatus: 'running' | 'stopped' | 'error';
          if (rawStatus === 'running') {
            containerStatus = 'running';
          } else if (rawStatus === 'exited' || rawStatus === 'created' || rawStatus === 'paused') {
            containerStatus = 'stopped';
          } else {
            containerStatus = 'error';
          }

          const createdAt = containerDetails.Created || new Date().toISOString();

          previewUrls.push({
            id: containerName,
            project_id: projectId,
            branch_name: branchName,
            subdomain: subdomain || '',
            full_url: fullUrl,
            container_status: containerStatus,
            ssl_enabled: fullUrl.startsWith('https://'),
            created_at: createdAt,
            last_accessed: null,
          });
        } catch (error) {
          console.warn(`Failed to process session ${sessionId}:`, error);
        }
      }

      return {
        preview_urls: previewUrls,
        total_count: previewUrls.length,
      };
    } catch (error) {
      console.error(`❌ Error getting preview URLs for project ${projectId}:`, error);
      return {
        preview_urls: [],
        total_count: 0,
      };
    }
  }

  /**
   * Destroy all previews for a project (full removal of containers, volumes, and storages)
   */
  async destroyAllProjectPreviews(
    projectId: string,
    sessionIds: string[]
  ): Promise<{ stopped: number; failed: number }> {
    console.log(`[CLEANUP] 🗑️ Destroying all previews for project ${projectId}`);
    console.log(`[CLEANUP] Sessions to destroy: ${sessionIds.join(', ')}`);

    let stopped = 0;
    let failed = 0;

    for (const sessionId of sessionIds) {
      try {
        await this.stopPreview(projectId, sessionId, true);
        stopped++;
      } catch (error) {
        console.error(`[CLEANUP] ❌ Failed to destroy session ${sessionId}:`, error);
        failed++;
      }
    }

    console.log(
      `[CLEANUP] Project ${projectId} cleanup complete: ${stopped} sessions destroyed, ${failed} failed`
    );
    return { stopped, failed };
  }

  /**
   * Restart all service containers for a preview
   */
  async restartPreview(projectId: string, sessionId: string): Promise<void> {
    console.log(`Restarting preview for project ${projectId} session ${sessionId}`);

    try {
      // Read kosuke.config.json to get all services
      const containerSessionPath = this.getContainerSessionPath(projectId, sessionId);
      const kosukeConfig = await readKosukeConfig(containerSessionPath);
      const { services } = kosukeConfig.preview;
      const client = await this.ensureClient();
      let restarted = 0;
      let failed = 0;

      // Restart all service containers
      for (const serviceName of Object.keys(services)) {
        const containerName = this.getContainerName(projectId, sessionId, serviceName);

        try {
          console.log(`Restarting service ${serviceName}...`);
          await client.containerRestart(containerName, { timeout: 10 });
          console.log(`✅ Restarted service ${serviceName}`);
          restarted++;
        } catch (error) {
          console.error(`❌ Failed to restart service ${serviceName}:`, error);
          failed++;
        }
      }

      console.log(`Preview restart complete: ${restarted} restarted, ${failed} failed`);

      if (failed > 0 && restarted === 0) {
        throw new Error('Failed to restart any services');
      }
    } catch (error) {
      console.error('Error restarting preview:', error);
      throw error;
    }
  }
}

/**
 * Singleton instance of PreviewService
 * Initialized once and reused across all requests
 */
let previewServiceInstance: PreviewService | null = null;

/**
 * Get the singleton PreviewService instance
 * Creates the instance on first call and reuses it for subsequent calls
 */
export function getPreviewService(): PreviewService {
  if (!previewServiceInstance) {
    console.log('🐳 Initializing Preview service singleton...');
    previewServiceInstance = new PreviewService();
  }
  return previewServiceInstance;
}
