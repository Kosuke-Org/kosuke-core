# Sandbox Architecture Implementation Plan

> **Goal:** Create a portable "fat" sandbox container that encapsulates the preview environment, agent, and file operations, enabling deployment on various platforms.

## Table of Contents

1. [Overview](#overview)
2. [Repository Structure](#repository-structure)
3. [Phase 1: Sandbox Container](#phase-1-sandbox-container)
4. [Phase 2: Fastify Agent Server](#phase-2-fastify-agent-server)
5. [Phase 3: Main App Changes](#phase-3-main-app-changes)
6. [Phase 4: Migration](#phase-4-migration)
7. [API Reference](#api-reference)
8. [Configuration](#configuration)

---

## Overview

### Current Architecture

```
Main App Container
├── Next.js UI
├── Agent (Claude SDK)
├── File Operations
├── Git Operations
└── Docker SDK (orchestrates previews)

Preview Containers (per service)
├── Bun Container
├── Python Container
├── Redis Container
└── Postgres Container (shared)

Shared Volumes
└── projects/{projectId}/sessions/{sessionId}/
```

### New Architecture

```
Main App Container
├── Next.js UI
├── Business Logic (branding, etc.)
├── Sandbox Manager (Docker SDK)
└── Sandbox HTTP Client

Sandbox Container (one per session)
├── Redis (internal)
├── Bun (dev/prod server)
├── Python (if needed)
├── Node.js Agent Server (Fastify)
│   ├── Claude Agent SDK
│   ├── Git Operations
│   └── File Operations
└── Project Files (cloned from GitHub)

External Services
├── Postgres (shared, logical DBs per sandbox)
└── Traefik (routing)
```

---

## Repository Structure

```
kosuke-core/
├── src/                              # Main Next.js app
│   ├── app/
│   │   └── api/
│   │       └── projects/
│   │           └── [id]/
│   │               ├── files/        # MODIFIED: proxy to sandbox
│   │               └── chat-sessions/
│   │                   └── [sessionId]/
│   │                       ├── route.ts           # MODIFIED: proxy to sandbox
│   │                       ├── preview/
│   │                       │   └── route.ts       # MODIFIED: use sandbox manager
│   │                       └── branding/          # MODIFIED: use sandbox file APIs
│   └── lib/
│       ├── sandbox/                  # NEW: Sandbox management
│       │   ├── index.ts              # Exports
│       │   ├── manager.ts            # SandboxManager class
│       │   ├── client.ts             # SandboxClient (HTTP)
│       │   ├── config.ts             # Configuration
│       │   └── types.ts              # TypeScript types
│       ├── agent/                    # REMOVE (moved to sandbox)
│       ├── sessions/                 # SIMPLIFY (remove file ops)
│       ├── previews/                 # REMOVE (replaced by sandbox)
│       └── branding/
│           └── operations.ts         # MODIFY: use sandbox client
│
├── sandbox/                          # NEW: Sandbox container source
│   ├── Dockerfile                    # Fat container image
│   ├── entrypoint.sh                 # Startup script
│   ├── supervisord.conf              # Process manager
│   ├── scripts/
│   │   ├── wait-for-services.sh      # Health check helper
│   │   └── install-deps.sh           # Dependency installer
│   ├── agent/                        # Fastify agent server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts              # Server entry
│   │   │   ├── app.ts                # Fastify app setup
│   │   │   ├── routes/
│   │   │   │   ├── health.ts         # GET /health
│   │   │   │   ├── messages.ts       # POST /messages
│   │   │   │   ├── files.ts          # GET/POST /files
│   │   │   │   └── git.ts            # POST /git/*
│   │   │   ├── services/
│   │   │   │   ├── agent.ts          # Claude Agent SDK wrapper
│   │   │   │   ├── git.ts            # Git operations
│   │   │   │   ├── files.ts          # File operations
│   │   │   │   └── health.ts         # Health status tracker
│   │   │   └── types/
│   │   │       └── index.ts          # Shared types
│   │   └── .env.example
│   └── config/
│       └── redis.conf                # Redis configuration
│
└── docs/
    └── SANDBOX_ARCHITECTURE.md       # This document
```

---

## Phase 1: Sandbox Container

### 1.1 Dockerfile

Create `sandbox/Dockerfile`:

```dockerfile
# ============================================================
# KOSUKE SANDBOX CONTAINER
# A fat container with all services needed for preview environments
# ============================================================

FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# ============================================================
# SYSTEM DEPENDENCIES
# ============================================================

RUN apt-get update && apt-get install -y \
    # Basic utilities
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    # Process management
    supervisor \
    # Redis
    redis-server \
    # Python
    python3 \
    python3-pip \
    python3-venv \
    # Build tools (for native modules)
    build-essential \
    # Cleanup
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# NODE.JS (for Agent Server)
# ============================================================

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# BUN (for Next.js projects)
# ============================================================

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# ============================================================
# DIRECTORY STRUCTURE
# ============================================================

WORKDIR /app

# /app/project     - Cloned repository (working directory)
# /app/agent       - Fastify agent server
# /app/cache/bun   - Shared bun cache
# /app/cache/pip   - Shared pip cache

RUN mkdir -p /app/project /app/agent /app/cache/bun /app/cache/pip

# Configure caches
ENV BUN_INSTALL_CACHE_DIR=/app/cache/bun
ENV PIP_CACHE_DIR=/app/cache/pip

# ============================================================
# AGENT SERVER
# ============================================================

COPY sandbox/agent/package.json sandbox/agent/package-lock.json* /app/agent/
RUN cd /app/agent && npm install --production

COPY sandbox/agent/dist /app/agent/dist

# ============================================================
# CONFIGURATION FILES
# ============================================================

COPY sandbox/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY sandbox/config/redis.conf /etc/redis/redis.conf
COPY sandbox/entrypoint.sh /entrypoint.sh
COPY sandbox/scripts /app/scripts

RUN chmod +x /entrypoint.sh /app/scripts/*.sh

# ============================================================
# PORTS
# ============================================================

# 3000 - Bun/Next.js (entrypoint service)
# 8000 - Python/FastAPI (if used)
# 6379 - Redis (internal only)
# 9000 - Agent API server

EXPOSE 3000 8000 9000

# ============================================================
# ENVIRONMENT VARIABLES (defaults, override at runtime)
# ============================================================

ENV KOSUKE_MODE=development
ENV KOSUKE_AGENT_ENABLED=true
ENV KOSUKE_AGENT_PORT=9000
ENV KOSUKE_PROJECT_DIR=/app/project

# ============================================================
# ENTRYPOINT
# ============================================================

ENTRYPOINT ["/entrypoint.sh"]
```

### 1.2 Entrypoint Script

Create `sandbox/entrypoint.sh`:

```bash
#!/bin/bash
set -e

# ============================================================
# KOSUKE SANDBOX ENTRYPOINT
# Orchestrates the startup sequence for the sandbox container
# ============================================================

echo "🚀 Starting Kosuke Sandbox..."
echo "   Mode: ${KOSUKE_MODE}"
echo "   Agent Enabled: ${KOSUKE_AGENT_ENABLED}"
echo "   Repo: ${KOSUKE_REPO_URL}"
echo "   Branch: ${KOSUKE_BRANCH}"

# ============================================================
# STATUS FILE (for health checks)
# ============================================================

STATUS_FILE="/tmp/sandbox_status"
echo "initializing" > $STATUS_FILE

update_status() {
    echo "$1" > $STATUS_FILE
    echo "📊 Status: $1"
}

# ============================================================
# STEP 1: START REDIS
# ============================================================

echo "🔴 Starting Redis..."
redis-server /etc/redis/redis.conf --daemonize yes

# Wait for Redis to be ready
until redis-cli ping > /dev/null 2>&1; do
    echo "   Waiting for Redis..."
    sleep 1
done
echo "✅ Redis is ready"

# ============================================================
# STEP 2: CLONE REPOSITORY
# ============================================================

update_status "cloning"

if [ -z "$KOSUKE_REPO_URL" ]; then
    echo "❌ Error: KOSUKE_REPO_URL is required"
    update_status "error"
    exit 1
fi

echo "📦 Cloning repository..."
echo "   URL: $KOSUKE_REPO_URL"
echo "   Branch: ${KOSUKE_BRANCH:-main}"

# Build authenticated URL if token provided
if [ -n "$KOSUKE_GITHUB_TOKEN" ]; then
    # Extract owner/repo from URL
    REPO_PATH=$(echo "$KOSUKE_REPO_URL" | sed -E 's|https://github.com/||' | sed 's|.git$||')
    AUTH_URL="https://x-access-token:${KOSUKE_GITHUB_TOKEN}@github.com/${REPO_PATH}.git"
else
    AUTH_URL="$KOSUKE_REPO_URL"
fi

# Clone the repository
cd /app
rm -rf project/*
git clone --depth 1 --branch "${KOSUKE_BRANCH:-main}" "$AUTH_URL" project

# Configure git user (for commits)
cd /app/project
git config user.name "Kosuke Bot"
git config user.email "bot@kosuke.dev"

# Store original URL (without token) for display
git remote set-url origin "$KOSUKE_REPO_URL"

echo "✅ Repository cloned"

# ============================================================
# STEP 3: READ KOSUKE CONFIG
# ============================================================

CONFIG_FILE="/app/project/kosuke.config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "⚠️ Warning: kosuke.config.json not found, using defaults"
    # Create default config
    cat > "$CONFIG_FILE" << 'EOF'
{
  "preview": {
    "services": {
      "default": {
        "type": "bun",
        "directory": ".",
        "is_entrypoint": true
      }
    }
  }
}
EOF
fi

echo "📋 Config file found: $CONFIG_FILE"

# ============================================================
# STEP 4: INSTALL DEPENDENCIES
# ============================================================

update_status "installing"

echo "📦 Installing dependencies..."

# Find and install for each service defined in config
# For simplicity, check for common files

cd /app/project

# Bun/Node dependencies
if [ -f "package.json" ]; then
    echo "   Installing bun dependencies (root)..."
    bun install --frozen-lockfile 2>/dev/null || bun install
fi

if [ -f "bun.lockb" ] || [ -f "package-lock.json" ]; then
    echo "   Dependencies installed at root"
fi

# Check for subdirectories with package.json (e.g., engine/)
for dir in */; do
    if [ -f "${dir}package.json" ]; then
        echo "   Installing dependencies in ${dir}..."
        cd "/app/project/${dir}"
        bun install --frozen-lockfile 2>/dev/null || bun install
        cd /app/project
    fi

    # Python dependencies
    if [ -f "${dir}requirements.txt" ]; then
        echo "   Installing Python dependencies in ${dir}..."
        cd "/app/project/${dir}"
        python3 -m venv .venv
        .venv/bin/pip install -r requirements.txt
        cd /app/project
    fi
done

# Python at root
if [ -f "requirements.txt" ]; then
    echo "   Installing Python dependencies (root)..."
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
fi

# Create marker file
touch /app/project/.kosuke-installed
echo "✅ Dependencies installed"

# ============================================================
# STEP 5: START SERVICES
# ============================================================

update_status "starting"

echo "🚀 Starting services..."

# Start supervisor (manages all services)
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
```

### 1.3 Supervisor Configuration

Create `sandbox/supervisord.conf`:

```ini
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid
childlogdir=/var/log/supervisor

# ============================================================
# REDIS (always running)
# ============================================================
# Redis is started in entrypoint.sh before supervisor
# This entry is just for monitoring

# ============================================================
# BUN SERVICE (Next.js / frontend)
# ============================================================

[program:bun]
command=/app/scripts/start-bun.sh
directory=/app/project
autostart=true
autorestart=true
stdout_logfile=/var/log/supervisor/bun.log
stderr_logfile=/var/log/supervisor/bun-error.log
environment=NODE_ENV="%(ENV_KOSUKE_MODE)s"

# ============================================================
# PYTHON SERVICE (FastAPI / engine) - Optional
# ============================================================

[program:python]
command=/app/scripts/start-python.sh
directory=/app/project
autostart=true
autorestart=true
stdout_logfile=/var/log/supervisor/python.log
stderr_logfile=/var/log/supervisor/python-error.log

# ============================================================
# AGENT SERVER (Fastify) - Conditional
# ============================================================

[program:agent]
command=node /app/agent/dist/index.js
directory=/app/agent
autostart=%(ENV_KOSUKE_AGENT_ENABLED)s
autorestart=true
stdout_logfile=/var/log/supervisor/agent.log
stderr_logfile=/var/log/supervisor/agent-error.log
environment=PORT="%(ENV_KOSUKE_AGENT_PORT)s",PROJECT_DIR="/app/project"

# ============================================================
# HEALTH CHECKER (updates status file)
# ============================================================

[program:health-checker]
command=/app/scripts/health-checker.sh
autostart=true
autorestart=true
stdout_logfile=/var/log/supervisor/health.log
stderr_logfile=/var/log/supervisor/health-error.log
```

### 1.4 Helper Scripts

Create `sandbox/scripts/start-bun.sh`:

```bash
#!/bin/bash
set -e

cd /app/project

# Read kosuke.config.json to find bun service directory
CONFIG_FILE="/app/project/kosuke.config.json"

if [ -f "$CONFIG_FILE" ]; then
    # Find the bun service directory (simplified - assumes first bun service)
    BUN_DIR=$(cat "$CONFIG_FILE" | python3 -c "
import json, sys
config = json.load(sys.stdin)
services = config.get('preview', {}).get('services', {})
for name, svc in services.items():
    if svc.get('type') == 'bun':
        print(svc.get('directory', '.'))
        break
" 2>/dev/null || echo ".")
else
    BUN_DIR="."
fi

cd "/app/project/$BUN_DIR"

echo "Starting Bun service in $(pwd)"
echo "Mode: $KOSUKE_MODE"

if [ "$KOSUKE_MODE" = "production" ]; then
    # Production: build and start
    echo "Running production build..."
    bun run build
    echo "Starting production server..."
    bun run start
else
    # Development: hot reload
    echo "Starting development server..."
    bun run dev
fi
```

Create `sandbox/scripts/start-python.sh`:

```bash
#!/bin/bash
set -e

cd /app/project

# Read kosuke.config.json to find python service directory
CONFIG_FILE="/app/project/kosuke.config.json"

if [ -f "$CONFIG_FILE" ]; then
    PYTHON_DIR=$(cat "$CONFIG_FILE" | python3 -c "
import json, sys
config = json.load(sys.stdin)
services = config.get('preview', {}).get('services', {})
for name, svc in services.items():
    if svc.get('type') == 'python':
        print(svc.get('directory', '.'))
        break
else:
    print('')
" 2>/dev/null || echo "")
else
    PYTHON_DIR=""
fi

# Exit if no python service defined
if [ -z "$PYTHON_DIR" ]; then
    echo "No Python service defined, exiting"
    exit 0
fi

cd "/app/project/$PYTHON_DIR"

echo "Starting Python service in $(pwd)"
echo "Mode: $KOSUKE_MODE"

# Activate virtual environment
source .venv/bin/activate

if [ "$KOSUKE_MODE" = "production" ]; then
    # Production: no reload
    uvicorn main:app --host 0.0.0.0 --port 8000
else
    # Development: hot reload
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
fi
```

Create `sandbox/scripts/health-checker.sh`:

```bash
#!/bin/bash

# Health checker script
# Updates /tmp/sandbox_status based on service health

STATUS_FILE="/tmp/sandbox_status"
CONFIG_FILE="/app/project/kosuke.config.json"

check_service() {
    local url=$1
    local timeout=${2:-2}

    curl -sf --max-time $timeout "$url" > /dev/null 2>&1
    return $?
}

while true; do
    # Don't check if still initializing/cloning/installing
    CURRENT_STATUS=$(cat $STATUS_FILE 2>/dev/null || echo "initializing")

    if [ "$CURRENT_STATUS" = "initializing" ] || \
       [ "$CURRENT_STATUS" = "cloning" ] || \
       [ "$CURRENT_STATUS" = "installing" ]; then
        sleep 2
        continue
    fi

    # Check if starting phase
    if [ "$CURRENT_STATUS" = "starting" ] || [ "$CURRENT_STATUS" = "ready" ]; then
        ALL_HEALTHY=true

        # Check Bun service (required)
        if ! check_service "http://localhost:3000/api/health"; then
            ALL_HEALTHY=false
        fi

        # Check Python service (if defined in config)
        if [ -f "$CONFIG_FILE" ]; then
            HAS_PYTHON=$(cat "$CONFIG_FILE" | python3 -c "
import json, sys
config = json.load(sys.stdin)
services = config.get('preview', {}).get('services', {})
has_python = any(s.get('type') == 'python' for s in services.values())
print('true' if has_python else 'false')
" 2>/dev/null || echo "false")

            if [ "$HAS_PYTHON" = "true" ]; then
                if ! check_service "http://localhost:8000/health"; then
                    ALL_HEALTHY=false
                fi
            fi
        fi

        # Check Agent (if enabled)
        if [ "$KOSUKE_AGENT_ENABLED" = "true" ]; then
            if ! check_service "http://localhost:${KOSUKE_AGENT_PORT:-9000}/health"; then
                ALL_HEALTHY=false
            fi
        fi

        # Update status
        if [ "$ALL_HEALTHY" = "true" ]; then
            if [ "$CURRENT_STATUS" != "ready" ]; then
                echo "ready" > $STATUS_FILE
                echo "✅ All services healthy - status: ready"
            fi
        else
            if [ "$CURRENT_STATUS" = "ready" ]; then
                echo "starting" > $STATUS_FILE
                echo "⚠️ Service became unhealthy - status: starting"
            fi
        fi
    fi

    sleep 5
done
```

Create `sandbox/config/redis.conf`:

```conf
# Redis configuration for sandbox
bind 127.0.0.1
port 6379
daemonize no
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly no
save ""
```

---

## Phase 2: Fastify Agent Server

### 2.1 Package Configuration

Create `sandbox/agent/package.json`:

```json
{
  "name": "@kosuke/sandbox-agent",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "@anthropic-ai/sdk": "^0.52.0",
    "@fastify/cors": "^9.0.0",
    "fastify": "^4.28.0",
    "simple-git": "^3.25.0",
    "mime-types": "^2.1.35"
  },
  "devDependencies": {
    "@types/mime-types": "^2.1.4",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

Create `sandbox/agent/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 2.2 Server Entry Point

Create `sandbox/agent/src/index.ts`:

```typescript
/**
 * Kosuke Sandbox Agent Server
 * Fastify server that handles agent operations, git, and file access
 */

import { buildApp } from './app.js';

const PORT = parseInt(process.env.PORT || '9000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`🚀 Agent server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
```

### 2.3 Fastify App Setup

Create `sandbox/agent/src/app.ts`:

```typescript
/**
 * Fastify App Configuration
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';

import { healthRoutes } from './routes/health.js';
import { messagesRoutes } from './routes/messages.js';
import { filesRoutes } from './routes/files.js';
import { gitRoutes } from './routes/git.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Register routes
  await app.register(healthRoutes, { prefix: '/' });
  await app.register(messagesRoutes, { prefix: '/' });
  await app.register(filesRoutes, { prefix: '/' });
  await app.register(gitRoutes, { prefix: '/git' });

  return app;
}
```

### 2.4 Routes

Create `sandbox/agent/src/routes/health.ts`:

```typescript
/**
 * Health Check Route
 * GET /health
 */

import { FastifyInstance } from 'fastify';
import { readFile } from 'fs/promises';

const STATUS_FILE = '/tmp/sandbox_status';

type SandboxStatus = 'initializing' | 'cloning' | 'installing' | 'starting' | 'ready' | 'error';

interface HealthResponse {
  status: SandboxStatus;
  error?: string;
}

export async function healthRoutes(app: FastifyInstance) {
  app.get<{ Reply: HealthResponse }>('/health', async (request, reply) => {
    try {
      const statusContent = await readFile(STATUS_FILE, 'utf-8');
      const status = statusContent.trim() as SandboxStatus;

      // Check for error file
      let error: string | undefined;
      try {
        error = await readFile('/tmp/sandbox_error', 'utf-8');
      } catch {
        // No error file
      }

      return { status, error };
    } catch (err) {
      return { status: 'initializing' as SandboxStatus };
    }
  });
}
```

Create `sandbox/agent/src/routes/messages.ts`:

```typescript
/**
 * Messages Route
 * POST /messages - Send message to agent, stream response
 */

import { FastifyInstance } from 'fastify';
import { AgentService } from '../services/agent.js';
import { GitService } from '../services/git.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources';

interface MessagesBody {
  content: string | MessageParam;
  attachments?: Array<{
    upload: {
      filename: string;
      fileUrl: string;
      fileType: string;
      mediaType: string;
      fileSize: number;
    };
  }>;
  githubToken: string;
  remoteId?: string | null;
}

export async function messagesRoutes(app: FastifyInstance) {
  const agentService = new AgentService();
  const gitService = new GitService();

  app.post<{ Body: MessagesBody }>('/messages', async (request, reply) => {
    const { content, attachments, githubToken, remoteId } = request.body;

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    try {
      // Build message parameter
      const messageParam = agentService.buildMessageParam(content, attachments);

      // Stream agent responses
      let capturedRemoteId: string | null = null;

      for await (const event of agentService.run(messageParam, remoteId)) {
        // Capture remoteId
        if (event.type === 'message_complete' && event.remoteId) {
          capturedRemoteId = event.remoteId;
        }

        // Send SSE event
        const data = JSON.stringify(event);
        reply.raw.write(`data: ${data}\n\n`);
      }

      // Commit and push changes
      let commitSha: string | null = null;
      try {
        const commitResult = await gitService.commitAndPush(githubToken);
        commitSha = commitResult.sha;
      } catch (err) {
        console.error('Failed to commit changes:', err);
      }

      // Send completion event
      const completeEvent = {
        type: 'complete',
        remoteId: capturedRemoteId,
        commitSha,
      };
      reply.raw.write(`data: ${JSON.stringify(completeEvent)}\n\n`);
      reply.raw.write('data: [DONE]\n\n');
    } catch (err) {
      const errorEvent = {
        type: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      };
      reply.raw.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    } finally {
      reply.raw.end();
    }
  });
}
```

Create `sandbox/agent/src/routes/files.ts`:

```typescript
/**
 * Files Routes
 * GET /files - List file tree
 * GET /files/* - Read file content
 * POST /files/* - Write file content
 */

import { FastifyInstance } from 'fastify';
import { FilesService } from '../services/files.js';
import mime from 'mime-types';

const PROJECT_DIR = process.env.PROJECT_DIR || '/app/project';

export async function filesRoutes(app: FastifyInstance) {
  const filesService = new FilesService(PROJECT_DIR);

  // List file tree
  app.get('/files', async (request, reply) => {
    try {
      const files = await filesService.listFiles();
      return { files };
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : 'Failed to list files' };
    }
  });

  // Read file content
  app.get<{ Params: { '*': string } }>('/files/*', async (request, reply) => {
    const filePath = request.params['*'];

    try {
      const content = await filesService.readFile(filePath);
      const contentType = mime.lookup(filePath) || 'application/octet-stream';

      reply.header('Content-Type', contentType);
      return content;
    } catch (err) {
      reply.status(404);
      return { error: 'File not found' };
    }
  });

  // Write file content
  app.post<{ Params: { '*': string }; Body: { content: string } }>(
    '/files/*',
    async (request, reply) => {
      const filePath = request.params['*'];
      const { content } = request.body;

      try {
        await filesService.writeFile(filePath, content);
        return { success: true };
      } catch (err) {
        reply.status(500);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to write file',
        };
      }
    }
  );
}
```

Create `sandbox/agent/src/routes/git.ts`:

```typescript
/**
 * Git Routes
 * POST /git/pull - Pull latest changes
 */

import { FastifyInstance } from 'fastify';
import { GitService } from '../services/git.js';

interface PullBody {
  branch: string;
  githubToken: string;
}

interface PullResponse {
  success: boolean;
  changed: boolean;
  error?: string;
}

export async function gitRoutes(app: FastifyInstance) {
  const gitService = new GitService();

  app.post<{ Body: PullBody; Reply: PullResponse }>('/pull', async (request, reply) => {
    const { branch, githubToken } = request.body;

    try {
      const result = await gitService.pull(branch, githubToken);
      return result;
    } catch (err) {
      return {
        success: false,
        changed: false,
        error: err instanceof Error ? err.message : 'Pull failed',
      };
    }
  });
}
```

### 2.5 Services

Create `sandbox/agent/src/services/agent.ts`:

```typescript
/**
 * Agent Service
 * Wraps the Claude Agent SDK for message processing
 */

import {
  query,
  type Options,
  type Query,
  type SDKMessage,
  type SDKResultMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources';

const PROJECT_DIR = process.env.PROJECT_DIR || '/app/project';
const MAX_TURNS = parseInt(process.env.AGENT_MAX_TURNS || '25', 10);
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

interface Attachment {
  upload: {
    filename: string;
    fileUrl: string;
    fileType: string;
    mediaType: string;
    fileSize: number;
  };
}

export class AgentService {
  /**
   * Build message parameter from content and attachments
   */
  buildMessageParam(content: string | MessageParam, attachments?: Attachment[]): MessageParam {
    // If already a MessageParam, return as-is
    if (typeof content !== 'string') {
      return content;
    }

    // Build content blocks
    const contentBlocks: Array<{ type: string; [key: string]: unknown }> = [];

    // Add text content
    if (content) {
      contentBlocks.push({ type: 'text', text: content });
    }

    // Add attachments
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const { upload } = attachment;

        if (upload.fileType === 'image') {
          contentBlocks.push({
            type: 'image',
            source: {
              type: 'url',
              url: upload.fileUrl,
            },
          });
        } else if (upload.fileType === 'document') {
          contentBlocks.push({
            type: 'document',
            source: {
              type: 'url',
              url: upload.fileUrl,
            },
          });
        }
      }
    }

    return {
      role: 'user',
      content: contentBlocks as MessageParam['content'],
    };
  }

  /**
   * Run the agent and yield stream events
   */
  async *run(message: MessageParam, remoteId?: string | null): AsyncGenerator<StreamEvent> {
    console.log(`🤖 Starting agent query in ${PROJECT_DIR}`);

    const options: Options = {
      cwd: PROJECT_DIR,
      model: MODEL,
      maxTurns: MAX_TURNS,
      permissionMode: 'acceptEdits',
      allowedTools: [
        'Task',
        'Bash',
        'Glob',
        'Grep',
        'LS',
        'Read',
        'Edit',
        'MultiEdit',
        'Write',
        'NotebookRead',
        'NotebookEdit',
        'WebFetch',
        'WebSearch',
        'TodoWrite',
        'ExitPlanMode',
      ],
      abortController: new AbortController(),
      additionalDirectories: [],
    };

    if (remoteId) {
      options.resume = remoteId;
    }

    // Build prompt generator
    const promptGenerator = this.createPromptGenerator(message);

    const queryInstance: Query = query({
      prompt: promptGenerator,
      options,
    });

    let capturedRemoteId: string | null = null;

    for await (const sdkMessage of queryInstance) {
      // Capture remoteId from result message
      if (!remoteId && !capturedRemoteId && sdkMessage.type === 'result') {
        capturedRemoteId = (sdkMessage as SDKResultMessage).session_id;
      }

      // Convert SDK message to client event
      const event = this.processSDKMessage(sdkMessage);
      if (event) {
        yield event;
      }
    }

    // Yield completion with remoteId
    yield {
      type: 'message_complete',
      remoteId: capturedRemoteId,
    };
  }

  /**
   * Create async generator for prompt input
   */
  private createPromptGenerator(message: MessageParam): AsyncGenerator<SDKUserMessage> {
    async function* generator(): AsyncGenerator<SDKUserMessage> {
      yield {
        type: 'user',
        session_id: '',
        message: message,
        parent_tool_use_id: null,
      };
    }
    return generator();
  }

  /**
   * Process SDK message and convert to client event
   */
  private processSDKMessage(message: SDKMessage): StreamEvent | null {
    // Handle different message types
    switch (message.type) {
      case 'assistant':
        return {
          type: 'assistant_message',
          content: message.message,
        };

      case 'user':
        return {
          type: 'user_message',
          content: message.message,
        };

      case 'result':
        return {
          type: 'result',
          subtype: message.subtype,
          session_id: message.session_id,
        };

      case 'progress':
        return {
          type: 'progress',
          content: message,
        };

      default:
        // Pass through other message types
        return {
          type: message.type,
          ...message,
        };
    }
  }
}
```

Create `sandbox/agent/src/services/git.ts`:

```typescript
/**
 * Git Service
 * Handles git operations within the sandbox
 */

import simpleGit, { SimpleGit } from 'simple-git';

const PROJECT_DIR = process.env.PROJECT_DIR || '/app/project';

interface CommitResult {
  sha: string | null;
  message: string;
}

interface PullResult {
  success: boolean;
  changed: boolean;
  error?: string;
}

export class GitService {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit(PROJECT_DIR);
  }

  /**
   * Commit all changes and push to remote
   */
  async commitAndPush(githubToken: string): Promise<CommitResult> {
    // Check for changes
    const status = await this.git.status();

    if (!status.modified.length && !status.not_added.length && !status.deleted.length) {
      return { sha: null, message: 'No changes to commit' };
    }

    // Stage all changes
    await this.git.add('-A');

    // Generate commit message
    const changedFiles = [...status.modified, ...status.not_added, ...status.deleted];
    const message = `Update ${changedFiles.length} file(s)\n\nModified by Kosuke Agent`;

    // Commit
    const commitResult = await this.git.commit(message);
    const sha = commitResult.commit || null;

    if (!sha) {
      return { sha: null, message: 'No changes committed' };
    }

    // Push with authentication
    await this.pushWithToken(githubToken);

    return { sha, message: 'Changes committed and pushed' };
  }

  /**
   * Pull latest changes from remote
   */
  async pull(branch: string, githubToken: string): Promise<PullResult> {
    try {
      // Get current commit
      const beforeCommit = await this.git.revparse(['HEAD']);

      // Fetch with authentication
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');

      if (!origin) {
        throw new Error('No origin remote found');
      }

      const authUrl = this.buildAuthUrl(origin.refs.fetch, githubToken);

      // Temporarily set authenticated URL
      await this.git.remote(['set-url', 'origin', authUrl]);

      try {
        await this.git.fetch('origin', branch);
        await this.git.reset(['--hard', `origin/${branch}`]);
      } finally {
        // Restore original URL (without token)
        const originalUrl = origin.refs.fetch.replace(/x-access-token:[^@]+@/, '');
        await this.git.remote(['set-url', 'origin', originalUrl]);
      }

      // Check if changes occurred
      const afterCommit = await this.git.revparse(['HEAD']);
      const changed = beforeCommit !== afterCommit;

      return { success: true, changed };
    } catch (err) {
      return {
        success: false,
        changed: false,
        error: err instanceof Error ? err.message : 'Pull failed',
      };
    }
  }

  /**
   * Push with authentication
   */
  private async pushWithToken(githubToken: string): Promise<void> {
    const remotes = await this.git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');

    if (!origin) {
      throw new Error('No origin remote found');
    }

    const authUrl = this.buildAuthUrl(origin.refs.push || origin.refs.fetch, githubToken);

    // Get current branch
    const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);

    // Temporarily set authenticated URL
    await this.git.remote(['set-url', 'origin', authUrl]);

    try {
      await this.git.push('origin', branch, ['--set-upstream']);
    } finally {
      // Restore original URL (without token)
      const originalUrl = (origin.refs.push || origin.refs.fetch).replace(
        /x-access-token:[^@]+@/,
        ''
      );
      await this.git.remote(['set-url', 'origin', originalUrl]);
    }
  }

  /**
   * Build authenticated GitHub URL
   */
  private buildAuthUrl(url: string, token: string): string {
    if (url.includes('github.com')) {
      const match = url.match(/github\.com[/:]([\w-]+)\/([\w.-]+?)(?:\.git)?$/);
      if (match) {
        const [, owner, repo] = match;
        return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
      }
    }
    return url;
  }
}
```

Create `sandbox/agent/src/services/files.ts`:

```typescript
/**
 * Files Service
 * Handles file system operations within the sandbox
 */

import { readdir, readFile, writeFile, stat, mkdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';

interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  lastModified?: string;
  children?: FileInfo[];
}

// Directories to exclude from file listing
const EXCLUDE_DIRS = new Set([
  '.next',
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  'venv',
  '.venv',
  'coverage',
  '.kosuke-installed',
]);

export class FilesService {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * List all files in the project as a tree structure
   */
  async listFiles(): Promise<FileInfo[]> {
    return this.readDirectoryRecursive(this.projectDir, '');
  }

  /**
   * Read a file's content
   */
  async readFile(filePath: string): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    return readFile(fullPath, 'utf-8');
  }

  /**
   * Write content to a file
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);

    // Ensure directory exists
    const dir = dirname(fullPath);
    await mkdir(dir, { recursive: true });

    await writeFile(fullPath, content, 'utf-8');
  }

  /**
   * Resolve and validate file path
   */
  private resolvePath(filePath: string): string {
    const fullPath = resolve(join(this.projectDir, filePath));

    // Security check: ensure path is within project directory
    if (!fullPath.startsWith(this.projectDir)) {
      throw new Error('Invalid file path: path traversal detected');
    }

    return fullPath;
  }

  /**
   * Read directory recursively
   */
  private async readDirectoryRecursive(
    basePath: string,
    relativePath: string
  ): Promise<FileInfo[]> {
    const currentPath = join(basePath, relativePath);
    const files: FileInfo[] = [];

    try {
      const items = await readdir(currentPath, { withFileTypes: true });

      for (const item of items) {
        // Skip excluded directories and hidden files
        if (EXCLUDE_DIRS.has(item.name) || item.name.startsWith('.')) {
          continue;
        }

        const itemPath = join(relativePath, item.name);
        const fullPath = join(currentPath, item.name);

        if (item.isDirectory()) {
          try {
            const stats = await stat(fullPath);
            const children = await this.readDirectoryRecursive(basePath, itemPath);

            files.push({
              name: item.name,
              type: 'directory',
              path: itemPath,
              lastModified: stats.mtime.toISOString(),
              children,
            });
          } catch (err) {
            console.warn(`Skipping directory ${itemPath}:`, err);
          }
        } else if (item.isFile()) {
          try {
            const stats = await stat(fullPath);

            files.push({
              name: item.name,
              type: 'file',
              path: itemPath,
              size: stats.size,
              lastModified: stats.mtime.toISOString(),
            });
          } catch (err) {
            console.warn(`Skipping file ${itemPath}:`, err);
          }
        }
      }

      // Sort: directories first, then files, alphabetically
      return files.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch (err) {
      console.error(`Failed to read directory ${currentPath}:`, err);
      return [];
    }
  }
}
```

---

## Phase 3: Main App Changes

### 3.1 Sandbox Manager

Create `src/lib/sandbox/manager.ts`:

```typescript
/**
 * Sandbox Manager
 * Manages sandbox container lifecycle using Docker SDK
 */

import { DockerClient, type ContainerCreateRequest } from '@docker/node-sdk';
import { getSandboxConfig } from './config';
import { generateSandboxName, sanitizeUUID } from './naming';

interface SandboxCreateOptions {
  projectId: string;
  sessionId: string;
  repoUrl: string;
  branch: string;
  githubToken: string;
  mode: 'development' | 'production';
  agentEnabled: boolean;
  postgresUrl: string;
}

interface SandboxInfo {
  containerId: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  url: string;
  agentUrl: string;
}

export class SandboxManager {
  private client: DockerClient | null = null;
  private config = getSandboxConfig();

  /**
   * Initialize Docker client
   */
  private async ensureClient(): Promise<DockerClient> {
    if (!this.client) {
      this.client = await DockerClient.fromDockerConfig();
    }
    return this.client;
  }

  /**
   * Create and start a sandbox container
   */
  async createSandbox(options: SandboxCreateOptions): Promise<SandboxInfo> {
    const client = await this.ensureClient();
    const containerName = generateSandboxName(options.projectId, options.sessionId);

    console.log(`🚀 Creating sandbox: ${containerName}`);

    // Check if container already exists
    try {
      const existing = await client.containerInspect(containerName);
      if (existing.State?.Running) {
        console.log(`Sandbox ${containerName} already running`);
        return this.getSandboxInfo(containerName);
      }

      // Container exists but stopped - remove it
      await client.containerDelete(containerName, { force: true });
    } catch {
      // Container doesn't exist, continue
    }

    // Prepare Traefik labels for routing
    const previewHost = this.generatePreviewHost(options.projectId, options.sessionId);
    const labels: Record<string, string> = {
      'traefik.enable': 'true',
      [`traefik.http.routers.${containerName}.rule`]: `Host(\`${previewHost}\`)`,
      [`traefik.http.routers.${containerName}.entrypoints`]: 'websecure',
      [`traefik.http.routers.${containerName}.tls.certresolver`]: 'letsencrypt',
      [`traefik.http.services.${containerName}.loadbalancer.server.port`]: '3000',
      'kosuke.project_id': options.projectId,
      'kosuke.session_id': options.sessionId,
    };

    // Container configuration
    const containerConfig: ContainerCreateRequest = {
      Image: this.config.sandboxImage,
      Env: [
        `KOSUKE_REPO_URL=${options.repoUrl}`,
        `KOSUKE_BRANCH=${options.branch}`,
        `KOSUKE_GITHUB_TOKEN=${options.githubToken}`,
        `KOSUKE_MODE=${options.mode}`,
        `KOSUKE_AGENT_ENABLED=${options.agentEnabled}`,
        `KOSUKE_POSTGRES_URL=${options.postgresUrl}`,
        `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,
        `CLAUDE_MODEL=${process.env.NEXT_PUBLIC_DEFAULT_MODEL}`,
      ],
      Labels: labels,
      HostConfig: {
        NetworkMode: this.config.networkName,
        Memory: this.config.memoryLimit,
        CpuShares: this.config.cpuShares,
        PidsLimit: this.config.pidsLimit,
      },
    };

    // Create container
    const createResult = await client.containerCreate(containerConfig, { name: containerName });

    // Start container
    await client.containerStart(createResult.Id);

    console.log(`✅ Sandbox ${containerName} started`);

    return this.getSandboxInfo(containerName);
  }

  /**
   * Get sandbox info
   */
  private async getSandboxInfo(containerName: string): Promise<SandboxInfo> {
    const client = await this.ensureClient();
    const container = await client.containerInspect(containerName);

    const projectId = container.Config?.Labels?.['kosuke.project_id'] || '';
    const sessionId = container.Config?.Labels?.['kosuke.session_id'] || '';
    const previewHost = this.generatePreviewHost(projectId, sessionId);

    return {
      containerId: container.Id!,
      name: containerName,
      status: container.State?.Running ? 'running' : 'stopped',
      url: `https://${previewHost}`,
      agentUrl: `http://${containerName}:9000`,
    };
  }

  /**
   * Stop and remove a sandbox
   */
  async destroySandbox(projectId: string, sessionId: string): Promise<void> {
    const client = await this.ensureClient();
    const containerName = generateSandboxName(projectId, sessionId);

    try {
      await client.containerStop(containerName, { timeout: 10 });
      await client.containerDelete(containerName, { force: true, volumes: true });
      console.log(`✅ Sandbox ${containerName} destroyed`);
    } catch (err) {
      console.error(`Failed to destroy sandbox ${containerName}:`, err);
    }
  }

  /**
   * Get sandbox URL for API calls
   */
  getSandboxAgentUrl(projectId: string, sessionId: string): string {
    const containerName = generateSandboxName(projectId, sessionId);
    return `http://${containerName}:9000`;
  }

  /**
   * Generate preview host for Traefik routing
   */
  private generatePreviewHost(projectId: string, sessionId: string): string {
    const sanitizedProjectId = sanitizeUUID(projectId);
    const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9]/g, '');
    return `project-${sanitizedProjectId}-${sanitizedSessionId}.${this.config.previewDomain}`;
  }
}

// Singleton instance
let sandboxManagerInstance: SandboxManager | null = null;

export function getSandboxManager(): SandboxManager {
  if (!sandboxManagerInstance) {
    sandboxManagerInstance = new SandboxManager();
  }
  return sandboxManagerInstance;
}
```

### 3.2 Sandbox Client

Create `src/lib/sandbox/client.ts`:

```typescript
/**
 * Sandbox Client
 * HTTP client for communicating with sandbox containers
 */

import { getSandboxManager } from './manager';

interface HealthResponse {
  status: 'initializing' | 'cloning' | 'installing' | 'starting' | 'ready' | 'error';
  error?: string;
}

interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  lastModified?: string;
  children?: FileInfo[];
}

interface PullResponse {
  success: boolean;
  changed: boolean;
  error?: string;
}

export class SandboxClient {
  private projectId: string;
  private sessionId: string;
  private baseUrl: string;

  constructor(projectId: string, sessionId: string) {
    this.projectId = projectId;
    this.sessionId = sessionId;

    const manager = getSandboxManager();
    this.baseUrl = manager.getSandboxAgentUrl(projectId, sessionId);
  }

  /**
   * Check sandbox health
   */
  async getHealth(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }

  /**
   * Wait for sandbox to be ready
   */
  async waitForReady(timeoutMs: number = 120000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const health = await this.getHealth();
        if (health.status === 'ready') {
          return true;
        }
        if (health.status === 'error') {
          throw new Error(health.error || 'Sandbox failed to start');
        }
      } catch (err) {
        // Connection refused - sandbox not ready yet
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return false;
  }

  /**
   * Send message to agent (returns SSE stream)
   */
  async sendMessage(
    content: string,
    attachments: unknown[],
    githubToken: string,
    remoteId?: string | null
  ): Promise<Response> {
    return fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        attachments,
        githubToken,
        remoteId,
      }),
    });
  }

  /**
   * List files in sandbox
   */
  async listFiles(): Promise<FileInfo[]> {
    const response = await fetch(`${this.baseUrl}/files`);
    const data = await response.json();
    return data.files;
  }

  /**
   * Read file content from sandbox
   */
  async readFile(filePath: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/files/${filePath}`);
    if (!response.ok) {
      throw new Error('File not found');
    }
    return response.text();
  }

  /**
   * Write file content to sandbox
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${filePath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to write file');
    }
  }

  /**
   * Pull latest changes in sandbox
   */
  async pull(branch: string, githubToken: string): Promise<PullResponse> {
    const response = await fetch(`${this.baseUrl}/git/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, githubToken }),
    });

    return response.json();
  }
}
```

### 3.3 Updated Branding Operations

Update `src/lib/branding/operations.ts` to use sandbox client:

```typescript
// Add at the top of the file
import { SandboxClient } from '@/lib/sandbox/client';

// Update findGlobalsCss function
async function findGlobalsCss(sandboxClient: SandboxClient): Promise<string | null> {
  const possiblePaths = [
    'app/globals.css',
    'src/globals.css',
    'styles/globals.css',
    'app/global.css',
  ];

  for (const path of possiblePaths) {
    try {
      await sandboxClient.readFile(path);
      return path;
    } catch {
      // File not found, try next
    }
  }

  return null;
}

// Update extractExistingColors to accept SandboxClient
export async function extractExistingColors(
  projectId: string,
  sessionId: string
): Promise<CssVariable[]> {
  try {
    const sandboxClient = new SandboxClient(projectId, sessionId);
    const globalsPath = await findGlobalsCss(sandboxClient);

    if (!globalsPath) {
      return [];
    }

    const cssContent = await sandboxClient.readFile(globalsPath);
    // ... rest of parsing logic (unchanged)
  } catch (error) {
    console.warn('⚠️ Error extracting existing colors:', error);
    return [];
  }
}

// Update updateSingleColor to use SandboxClient
export async function updateSingleColor(
  projectId: string,
  sessionId: string,
  name: string,
  value: string,
  mode: 'light' | 'dark'
): Promise<{ success: boolean; message: string }> {
  try {
    const sandboxClient = new SandboxClient(projectId, sessionId);
    const globalsPath = await findGlobalsCss(sandboxClient);

    if (!globalsPath) {
      return { success: false, message: 'Could not find globals.css file' };
    }

    // Read current CSS
    let cssContent = await sandboxClient.readFile(globalsPath);

    // ... validation and update logic (unchanged)

    // Write updated CSS back
    await sandboxClient.writeFile(globalsPath, cssContent);

    return { success: true, message: `Updated ${name}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update color',
    };
  }
}

// Similarly update applyColorPalette and getSessionFonts
```

---

## Phase 4: Migration

### 4.1 Migration Steps

| Step | Description                                               | Risk   | Rollback            |
| ---- | --------------------------------------------------------- | ------ | ------------------- |
| 1    | Build and push sandbox Docker image                       | Low    | N/A                 |
| 2    | Deploy sandbox manager alongside existing preview service | Low    | Remove new code     |
| 3    | Create feature flag for sandbox mode                      | Low    | Disable flag        |
| 4    | Migrate new sessions to sandbox (flag-controlled)         | Medium | Disable flag        |
| 5    | Monitor and fix issues                                    | Medium | Disable flag        |
| 6    | Migrate existing sessions on next start                   | Medium | Keep old containers |
| 7    | Remove old preview service code                           | Low    | Revert commit       |
| 8    | Clean up old containers                                   | Low    | N/A                 |

### 4.2 Feature Flag Implementation

Add to `src/lib/sandbox/config.ts`:

```typescript
export function isSandboxEnabled(): boolean {
  return process.env.SANDBOX_MODE_ENABLED === 'true';
}
```

Use in preview routes to choose between old and new implementations.

### 4.3 Parallel Running Period

During migration, both systems can run:

- Old preview containers continue working for existing sessions
- New sessions use sandbox containers
- Gradually migrate as confidence builds

---

## API Reference

### Sandbox API

| Endpoint       | Method | Description                 |
| -------------- | ------ | --------------------------- |
| `/health`      | GET    | Get sandbox status          |
| `/messages`    | POST   | Send message to agent (SSE) |
| `/files`       | GET    | List file tree              |
| `/files/*path` | GET    | Read file content           |
| `/files/*path` | POST   | Write file content          |
| `/git/pull`    | POST   | Pull latest changes         |

### Health Response

```json
{
  "status": "ready",
  "error": null
}
```

Status values: `initializing`, `cloning`, `installing`, `starting`, `ready`, `error`

### Messages Request

```json
{
  "content": "Add a button to the homepage",
  "attachments": [],
  "githubToken": "ghu_xxx",
  "remoteId": null
}
```

### Messages Response (SSE)

```
data: {"type":"assistant_message","content":{...}}
data: {"type":"progress","content":{...}}
data: {"type":"complete","remoteId":"xxx","commitSha":"abc123"}
data: [DONE]
```

---

## Configuration

### Environment Variables

#### Main App

```bash
# Sandbox configuration
SANDBOX_MODE_ENABLED=true
SANDBOX_IMAGE=kosuke/sandbox:latest
SANDBOX_NETWORK=kosuke_network
SANDBOX_PREVIEW_DOMAIN=previews.kosuke.ai
SANDBOX_MEMORY_LIMIT=2147483648  # 2GB
SANDBOX_CPU_SHARES=512
SANDBOX_PIDS_LIMIT=256
```

#### Sandbox Container

```bash
# Required (passed at runtime)
KOSUKE_REPO_URL=https://github.com/org/repo.git
KOSUKE_BRANCH=main
KOSUKE_GITHUB_TOKEN=ghu_xxx
KOSUKE_MODE=development
KOSUKE_AGENT_ENABLED=true
KOSUKE_POSTGRES_URL=postgres://...

# Agent configuration
ANTHROPIC_API_KEY=sk-ant-xxx
CLAUDE_MODEL=claude-sonnet-4-20250514
AGENT_MAX_TURNS=25

# Ports
KOSUKE_AGENT_PORT=9000
```

---

## Next Steps

1. **Create sandbox directory structure** in the repository
2. **Build and test Dockerfile** locally
3. **Implement Fastify agent server** with all routes
4. **Add sandbox manager** to main app
5. **Create feature flag** for gradual rollout
6. **Test with a single session** before wider deployment
7. **Monitor and iterate**

---

_Last updated: December 2024_
