# ============================================================
# KOSUKE SANDBOX CONTAINER
# Fat container with all services needed for preview environments
# ============================================================

FROM debian:bookworm-slim

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Pin versions
ARG NODE_VERSION=22.20.0
ARG BUN_VERSION=1.3.1

# ============================================================
# SYSTEM DEPENDENCIES
# ============================================================

RUN apt-get update && apt-get install -y --no-install-recommends \
    # Basic utilities
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    xz-utils \
    unzip \
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
# NODE.JS (pinned version, multi-arch)
# ============================================================

RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then NODE_ARCH="x64"; \
    elif [ "$ARCH" = "arm64" ]; then NODE_ARCH="arm64"; \
    else echo "Unsupported architecture: $ARCH" && exit 1; fi && \
    curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz | \
    tar -xJ -C /usr/local --strip-components=1 && \
    node --version && npm --version

# ============================================================
# BUN (pinned version) - Install to /usr/local for all users
# ============================================================

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
    mv /root/.bun/bin/bun /usr/local/bin/bun && \
    chmod +x /usr/local/bin/bun && \
    rm -rf /root/.bun
RUN bun --version

# ============================================================
# UV (Python package manager)
# ============================================================

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
RUN uv --version

# ============================================================
# PLAYWRIGHT CHROMIUM SYSTEM DEPENDENCIES (as root)
# Optional: Set INSTALL_CHROMIUM=false to skip (saves ~500MB)
# Usage: docker build --build-arg INSTALL_CHROMIUM=false .
# ============================================================

ARG INSTALL_CHROMIUM=true

RUN if [ "$INSTALL_CHROMIUM" = "true" ]; then \
    echo "📦 Installing Chromium system dependencies..." && \
    npx playwright@latest install-deps chromium && \
    echo "✅ System dependencies installed"; \
else \
    echo "⏭️  Skipping Chromium installation"; \
fi

# ============================================================
# NON-ROOT USER
# ============================================================

# Create kosuke user and group
RUN groupadd -r kosuke && useradd -r -g kosuke -m -s /bin/bash kosuke && \
    # Allow kosuke user to install global npm packages
    chown -R kosuke:kosuke /usr/local/lib /usr/local/bin /usr/local/share

# ============================================================
# DIRECTORY STRUCTURE
# ============================================================

WORKDIR /app

# /app/project     - Cloned repository (working directory)
# /app/agent       - Fastify agent server
# /app/scripts     - Helper scripts

RUN mkdir -p /app/project /app/agent /app/scripts /var/log/supervisor && \
    chown -R kosuke:kosuke /app /var/log/supervisor

# ============================================================
# KOSUKE CLI AGENT
# LOCAL: Expects kosuke-cli to be mounted at runtime
# PRODUCTION: Install from npm package when available
# ============================================================

# Build argument to control installation mode
ARG KOSUKE_CLI_MODE=production

# Setup based on mode
RUN if [ "$KOSUKE_CLI_MODE" = "production" ]; then \
    echo "📦 Installing @kosuke-org/cli from npm..." && \
    npm install -g @kosuke-org/cli && \
    kosuke --version; \
else \
    echo "💡 Local mode: kosuke-cli will be mounted at runtime"; \
fi

# ============================================================
# CONFIGURATION FILES
# ============================================================

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY config/redis.conf /etc/redis/redis.conf
COPY entrypoint.sh /entrypoint.sh
COPY scripts/ /app/scripts/

RUN chmod +x /entrypoint.sh /app/scripts/*.sh && \
    chown kosuke:kosuke /etc/supervisor/conf.d/supervisord.conf && \
    chown kosuke:kosuke /etc/redis/redis.conf && \
    mkdir -p /etc/redis && chown kosuke:kosuke /etc/redis

# ============================================================
# PORTS
# ============================================================

# 3000 - Bun/Next.js (entrypoint service)
# Note: Agent port (9000) and Redis (6379) are internal only,
# accessed via Docker network by the main application

EXPOSE 3000

# ============================================================
# ENVIRONMENT VARIABLES (defaults, override at runtime)
# ============================================================

ENV KOSUKE_MODE=development
ENV KOSUKE_AGENT_PORT=9000
ENV KOSUKE_PROJECT_DIR=/app/project

# ============================================================
# HEALTH CHECK
# ============================================================

HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:${KOSUKE_AGENT_PORT}/health || exit 1

# ============================================================
# SWITCH TO NON-ROOT USER
# ============================================================

USER kosuke

# ============================================================
# PLAYWRIGHT CHROMIUM BROWSERS (as kosuke user)
# ============================================================

RUN if [ "$INSTALL_CHROMIUM" = "true" ]; then \
    echo "📦 Installing Chromium browser..." && \
    npx playwright@latest install chromium && \
    echo "✅ Chromium installed for user kosuke"; \
else \
    echo "⏭️  Skipping Chromium browser installation"; \
fi

# ============================================================
# ENTRYPOINT
# ============================================================

ENTRYPOINT ["/entrypoint.sh"]
