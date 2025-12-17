import * as Sentry from '@sentry/nextjs';

/**
 * Validates required environment variables at runtime startup
 * This runs after build but before the application serves requests
 */
function validateEnvironmentVariables() {
  const sentryEnabled = process.env.SENTRY_ENABLED !== 'false';

  const requiredEnvVars = [
    // Database
    { key: 'POSTGRES_URL', description: 'PostgreSQL database connection URL' },
    { key: 'POSTGRES_DB', description: 'PostgreSQL database name' },
    { key: 'POSTGRES_USER', description: 'PostgreSQL database user' },
    { key: 'POSTGRES_PASSWORD', description: 'PostgreSQL database password' },
    { key: 'POSTGRES_HOST', description: 'PostgreSQL database host' },
    { key: 'POSTGRES_PORT', description: 'PostgreSQL database port' },

    // Clerk Authentication
    { key: 'CLERK_SECRET_KEY', description: 'Clerk secret key for authentication' },

    // AI Provider
    { key: 'ANTHROPIC_API_KEY', description: 'Anthropic API key for Claude AI' },
    { key: 'AGENT_MAX_TURNS', description: 'Maximum number of agent conversation turns' },

    // Docker
    { key: 'DOCKER_HOST', description: 'Docker socket path' },

    // GitHub Configuration
    { key: 'TEMPLATE_REPOSITORY', description: 'GitHub template repository' },
    { key: 'GITHUB_APP_ID', description: 'GitHub App ID for authentication' },
    { key: 'GITHUB_APP_PRIVATE_KEY', description: 'GitHub App private key' },
    { key: 'GITHUB_APP_INSTALLATION_ID', description: 'GitHub App installation ID' },
    { key: 'GITHUB_WEBHOOK_SECRET', description: 'GitHub webhook secret for verification' },

    // Preview Configuration
    { key: 'PREVIEW_RESEND_API_KEY', description: 'Resend API key for preview environments' },

    // Sandbox Configuration
    { key: 'SANDBOX_IMAGE', description: 'Docker image for sandbox containers' },
    { key: 'SANDBOX_NETWORK', description: 'Docker network for sandbox containers' },
    { key: 'SANDBOX_PORT_RANGE_START', description: 'Start of port range for sandbox containers' },
    { key: 'SANDBOX_PORT_RANGE_END', description: 'End of port range for sandbox containers' },
    { key: 'SANDBOX_MEMORY_LIMIT', description: 'Memory limit for sandbox containers' },
    { key: 'SANDBOX_CPU_SHARES', description: 'CPU shares for sandbox containers' },
    { key: 'SANDBOX_PIDS_LIMIT', description: 'PIDs limit for sandbox containers' },
    { key: 'SANDBOX_AGENT_PORT', description: 'Port for sandbox agent communication' },
    { key: 'SANDBOX_BUN_PORT', description: 'Bun service port inside sandbox container' },
    { key: 'SANDBOX_PYTHON_PORT', description: 'Python service port inside sandbox container' },
    { key: 'SANDBOX_BASE_DOMAIN', description: 'Base domain for preview deployments' },
    { key: 'SANDBOX_GIT_EMAIL', description: 'Git email for sandbox commits' },

    // Sessions
    { key: 'SESSION_BRANCH_PREFIX', description: 'Git branch prefix for sessions' },

    // Domain Configuration
    { key: 'TRAEFIK_ENABLED', description: 'Enable Traefik reverse proxy' },

    // Digital Ocean Spaces (Storage)
    { key: 'S3_REGION', description: 'Digital Ocean Spaces region' },
    { key: 'S3_ENDPOINT', description: 'Digital Ocean Spaces endpoint URL' },
    { key: 'S3_BUCKET', description: 'Digital Ocean Spaces bucket name' },
    { key: 'S3_ACCESS_KEY_ID', description: 'Digital Ocean Spaces access key' },
    { key: 'S3_SECRET_ACCESS_KEY', description: 'Digital Ocean Spaces secret key' },

    // Redis Configuration
    { key: 'REDIS_PASSWORD', description: 'Redis password' },
    { key: 'REDIS_URL', description: 'Redis connection URL for job queue' },

    // Preview Cleanup Configuration
    { key: 'CLEANUP_THRESHOLD_MINUTES', description: 'Minutes of inactivity before cleanup' },
    { key: 'CLEANUP_INTERVAL_MINUTES', description: 'Minutes between cleanup job runs' },
    { key: 'CLEANUP_WORKER_CONCURRENCY', description: 'Number of concurrent cleanup workers' },

    // Queue Configuration
    { key: 'QUEUE_MAX_ATTEMPTS', description: 'Maximum retry attempts for failed jobs' },
    { key: 'QUEUE_BACKOFF_DELAY_SEC', description: 'Initial backoff delay in seconds' },
    { key: 'QUEUE_REMOVE_ON_COMPLETE_DAYS', description: 'Days to keep completed jobs' },
    { key: 'QUEUE_REMOVE_ON_COMPLETE_COUNT', description: 'Max completed jobs to keep' },
    { key: 'QUEUE_REMOVE_ON_FAIL_DAYS', description: 'Days to keep failed jobs' },
    { key: 'QUEUE_REMOVE_ON_FAIL_COUNT', description: 'Max failed jobs to keep' },
    { key: 'QUEUE_WORKER_CONCURRENCY', description: 'Number of concurrent worker jobs' },

    // Conditionally required based on feature flags
    ...(sentryEnabled
      ? [{ key: 'SENTRY_AUTH_TOKEN', description: 'Sentry authentication token' }]
      : []),
  ];

  const missingVars = requiredEnvVars.filter(({ key }) => !process.env[key]);

  if (missingVars.length > 0) {
    const errorMessage = [
      '❌ Missing required environment variables:',
      ...missingVars.map(({ key, description }) => `  - ${key}: ${description}`),
      '\nPlease add these to your environment variables before starting the application.',
    ].join('\n');

    throw new Error(errorMessage);
  }

  console.log('✅ All required environment variables are present');
}

export async function register() {
  console.log('📊 Instrumentation register() called');

  // Validate environment variables on server startup
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    validateEnvironmentVariables();
  }

  // Initialize Sentry in production if DSN is available
  if (process.env.SENTRY_DSN && process.env.NODE_ENV === 'production') {
    console.log('📊 Initializing Sentry...');
    try {
      if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('../sentry.server.config');
      } else if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config');
      }
      console.log('✅ Sentry ready');
    } catch (error) {
      console.error('❌ Sentry init failed:', error);
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
