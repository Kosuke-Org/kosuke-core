/**
 * Sandbox Configuration
 * Configuration for sandbox container management
 */

interface SandboxConfig {
  /** Docker image for sandbox containers */
  sandboxImage: string;
  /** Docker network name */
  networkName: string;
  /** Whether Traefik is enabled (false for local development) */
  traefikEnabled: boolean;
  /** Preview domain for Traefik routing */
  previewDomain: string;
  /** Port range start for local development */
  portRangeStart: number;
  /** Port range end for local development */
  portRangeEnd: number;
  /** Memory limit in bytes (default: 2GB) */
  memoryLimit: number;
  /** CPU shares (default: 512) */
  cpuShares: number;
  /** PIDs limit (default: 256) */
  pidsLimit: number;
  /** Agent port inside container */
  agentPort: number;
  /** Whether to generate test tickets in plan phase */
  planTest: boolean;
}

let sandboxConfig: SandboxConfig | null = null;

/**
 * Get sandbox configuration from environment
 */
export function getSandboxConfig(): SandboxConfig {
  if (!sandboxConfig) {
    sandboxConfig = {
      sandboxImage: process.env.SANDBOX_IMAGE!,
      networkName: process.env.SANDBOX_NETWORK!,
      traefikEnabled: process.env.TRAEFIK_ENABLED === 'true',
      previewDomain: process.env.SANDBOX_BASE_DOMAIN!,
      portRangeStart: parseInt(process.env.SANDBOX_PORT_RANGE_START!, 10),
      portRangeEnd: parseInt(process.env.SANDBOX_PORT_RANGE_END!, 10),
      memoryLimit: parseInt(process.env.SANDBOX_MEMORY_LIMIT!, 10),
      cpuShares: parseInt(process.env.SANDBOX_CPU_SHARES!, 10),
      pidsLimit: parseInt(process.env.SANDBOX_PIDS_LIMIT!, 10),
      agentPort: parseInt(process.env.SANDBOX_AGENT_PORT!, 10),
      planTest: process.env.SANDBOX_PLAN_TEST === 'true',
    };
  }
  return sandboxConfig;
}
