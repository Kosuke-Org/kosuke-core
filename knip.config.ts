import type { KnipConfig } from 'knip';

const knipConfig: KnipConfig = {
  $schema: 'https://unpkg.com/knip@latest/schema.json',

  // Workspaces for monorepo support
  workspaces: {
    // Main Next.js application
    '.': {
      ignore: [
        'venv/**',
        '.venv/**',
        // Shadcn/UI components, we keep them as part of the template
        'src/components/ui/**',
        // Library barrel exports, infrastructure for template users
        'src/lib/**/index.ts',
        // Template/infrastructure files - analytics setup for server-side tracking
        'src/lib/analytics/server.ts',
        'src/lib/analytics/events.ts',
        // Template/infrastructure files - ready for future use
        'src/hooks/use-posthog.ts',
        'src/hooks/use-mobile.ts',
        // Data migration scripts - run manually when needed
        'src/lib/db/scripts/**',
      ],
      ignoreDependencies: [
        // Shadcn/UI dependencies (only used in components/ui/** which is ignored)
        '@radix-ui/*',
        'embla-carousel-react',
        'input-otp',
        'react-resizable-panels',
        'vaul',
        'ts-node',
        'react-hook-form',
        // Dependencies used in configuration files or by frameworks
        'react-day-picker',
        'recharts',
        'server-only',
        'sonner',
        'eslint-config-next',
        'eslint-config-prettier',
        'posthog-node',
        // TODO check if we should use these dependencies
        '@types/bcryptjs',
        '@types/marked',
        // Types for global scripts loaded via CDN
        '@types/cookiebot-sdk',
        // Dependencies used in build scripts or configuration
        '@eslint/eslintrc',
      ],
      entry: ['src/app/**/page.tsx', 'src/app/**/layout.tsx', 'src/app/api/**/*.ts'],
    },

    // Sandbox agent (Fastify server)
    'sandbox/agent': {
      ignoreDependencies: [],
      ignore: ['../scripts/parse-config.js'],
    },
  },

  rules: {
    files: 'error',
    dependencies: 'error',
    devDependencies: 'warn',
    unlisted: 'error',
    binaries: 'error',
    unresolved: 'error',
    exports: 'error',
    types: 'error',
    nsExports: 'error',
    nsTypes: 'error',
    duplicates: 'error',
    enumMembers: 'error',
    classMembers: 'error',
  },
};

export default knipConfig;
