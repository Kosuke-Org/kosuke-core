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
    # Python WeasyPrint dependencies
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz-subset0 \
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
# PLAYWRIGHT CHROME DEPENDENCIES (for Playwright MCP)
# Install all dependencies that Chrome needs as root before switching to kosuke user
# ============================================================

ARG INSTALL_CHROMIUM=true

RUN if [ "$INSTALL_CHROMIUM" = "true" ]; then \
    echo "📦 Installing Chrome dependencies..." && \
    apt-get update && apt-get install -y --no-install-recommends \
        # Core libraries
        libnss3 \
        libnspr4 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libdrm2 \
        libdbus-1-3 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libgbm1 \
        libasound2 \
        libcairo2 \
        libatspi2.0-0 \
        # Fonts
        fonts-liberation \
        fonts-noto-color-emoji \
        # Additional
        libxshmfence1 \
        libglib2.0-0 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxext6 \
        libxrender1 \
        libxtst6 \
        && rm -rf /var/lib/apt/lists/*; \
fi

# ============================================================
# NON-ROOT USER
# ============================================================

# Create kosuke user and group
RUN groupadd -r kosuke && useradd -r -g kosuke -m -s /bin/bash kosuke && \
    # Allow kosuke user to install global npm packages
    chown -R kosuke:kosuke /usr/local/lib /usr/local/bin /usr/local/share

# ============================================================
# PLAYWRIGHT MCP + BROWSERS (install as root, then fix ownership)
# ============================================================

ARG INSTALL_CHROMIUM=true

RUN if [ "$INSTALL_CHROMIUM" = "true" ]; then \
    echo "📦 Installing Playwright MCP and browsers..." && \
    npm install -g @playwright/mcp@latest && \
    cd /usr/local/lib/node_modules/@playwright/mcp && \
    # Try chrome first (chrome-for-testing), fallback to chromium
    npx playwright install chrome || npx playwright install chromium && \
    # Move playwright cache to kosuke's home directory
    mkdir -p /home/kosuke/.cache && \
    mv /root/.cache/ms-playwright /home/kosuke/.cache/ && \
    chown -R kosuke:kosuke /home/kosuke/.cache && \
    echo "✅ Playwright MCP and browsers installed"; \
fi

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

# Setup based on mode (uses BuildKit secret for npm token)
RUN --mount=type=secret,id=npm_token \
    if [ "$KOSUKE_CLI_MODE" = "production" ]; then \
        echo "📦 Installing @kosuke-org/cli from GitHub Packages..." && \
        npm config set @Kosuke-Org:registry https://npm.pkg.github.com && \
        if [ -f /run/secrets/npm_token ]; then \
            npm config set //npm.pkg.github.com/:_authToken $(cat /run/secrets/npm_token); \
        fi && \
        npm install -g @Kosuke-Org/cli && \
        which kosuke && echo "✅ kosuke-cli installed"; \
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
ENV PLAYWRIGHT_MCP_GLOBAL=true
ENV PLAYWRIGHT_BROWSERS_PATH=/home/kosuke/.cache/ms-playwright

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
# CHROMIUM PATH DETECTION (for Playwright MCP)
# ============================================================

RUN echo 'export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(ls -d "$PLAYWRIGHT_BROWSERS_PATH"/chromium-*/chrome-linux/chrome 2>/dev/null | grep -v headless_shell | head -1)' >> ~/.bashrc

# ============================================================
# ENTRYPOINT
# ============================================================

ENTRYPOINT ["/entrypoint.sh"]
