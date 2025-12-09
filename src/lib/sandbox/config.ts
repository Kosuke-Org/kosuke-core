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
}

let sandboxConfig: SandboxConfig | null = null;

/**
 * Get sandbox configuration from environment
 */
export function getSandboxConfig(): SandboxConfig {
  if (!sandboxConfig) {
    sandboxConfig = {
      sandboxImage: process.env.SANDBOX_IMAGE || 'ghcr.io/kosuke-org/kosuke-sandbox:latest',
      networkName: process.env.SANDBOX_NETWORK || 'kosuke_network',
      traefikEnabled: process.env.TRAEFIK_ENABLED === 'true',
      previewDomain: process.env.SANDBOX_PREVIEW_DOMAIN || 'previews.kosuke.ai',
      portRangeStart: 4000,
      portRangeEnd: 4999,
      memoryLimit: parseInt(process.env.SANDBOX_MEMORY_LIMIT || '2147483648', 10), // 2GB
      cpuShares: parseInt(process.env.SANDBOX_CPU_SHARES || '512', 10),
      pidsLimit: parseInt(process.env.SANDBOX_PIDS_LIMIT || '256', 10),
      agentPort: parseInt(process.env.SANDBOX_AGENT_PORT || '9000', 10),
    };
  }
  return sandboxConfig;
}
