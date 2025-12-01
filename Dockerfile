# syntax=docker/dockerfile:1.4
FROM oven/bun:1.3.1-slim AS base

# Install dependencies only when needed
FROM base AS deps

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json bun.lock ./

# Use mount cache for Bun
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
ARG DOCKER_GID=988
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/bun.lock ./bun.lock

# Copy only the necessary files for the build
COPY next.config.* .
COPY sentry*.config.* .
COPY tsconfig.json .
COPY tailwind.config.* .
COPY postcss.config.* .
COPY drizzle.config.* .
COPY eslint.config.* .
COPY jest.config.* .
COPY components.json .
COPY public ./public
COPY src ./src
COPY .env.build .env

# Enable build optimizations
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_STANDALONE=true
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Use BuildKit cache mount for Next.js
RUN --mount=type=cache,target=/app/.next/cache \
    bun run build

# Production image, copy all the files and run next
FROM node:22.20.0-slim AS runner
ARG DOCKER_GID=988
WORKDIR /app

# Install git and CA certificates for repository operations
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally (required by @anthropic-ai/claude-agent-sdk)
RUN npm install -g @anthropic-ai/claude-code

RUN \
    groupadd --system --gid 1001 nodejs && \
    groupadd --gid ${DOCKER_GID} docker && \
    useradd --system --uid 1001 --gid nodejs --create-home nextjs && \
    usermod -aG docker nextjs && \
    mkdir -p .next projects /home/nextjs/.claude && \
    chown -R nextjs:nodejs .next projects /home/nextjs

# Copy only the necessary files
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.env* ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.* ./
COPY --from=builder --chown=nextjs:nodejs /app/src/middleware.ts ./middleware.ts
COPY --from=builder --chown=nextjs:nodejs /app/sentry*.config.* ./
COPY --from=builder --chown=nextjs:nodejs /app/src/lib ./lib
COPY --from=builder --chown=nextjs:nodejs /app/src/worker.ts ./src/worker.ts

USER nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/home/nextjs

EXPOSE 3000

CMD ["node", "server.js"]
