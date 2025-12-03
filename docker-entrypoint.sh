#!/bin/sh
set -e

# Fix docker socket permissions if running as root and socket exists
# Docker Desktop on Mac mounts socket as root:root, need to make it accessible
if [ "$(id -u)" = "0" ] && [ -S "/var/run/docker.sock" ]; then
  echo "🔧 Fixing docker socket permissions..."
  chmod 666 /var/run/docker.sock
fi

echo "🔧 Checking kosuke-cli dependencies..."

# Check if kosuke-cli has a package.json and needs dependencies installed
if [ -f "/app/node_modules/@kosuke-ai/cli/package.json" ]; then
  NEEDS_INSTALL=false

  # Check if node_modules directory doesn't exist
  if [ ! -d "/app/node_modules/@kosuke-ai/cli/node_modules" ]; then
    echo "📦 node_modules directory missing"
    NEEDS_INSTALL=true
  # Check if directory is empty
  elif [ -z "$(ls -A /app/node_modules/@kosuke-ai/cli/node_modules 2>/dev/null)" ]; then
    echo "📦 node_modules directory is empty"
    NEEDS_INSTALL=true
  # Check if key dependencies are missing
  elif [ ! -d "/app/node_modules/@kosuke-ai/cli/node_modules/@anthropic-ai" ]; then
    echo "📦 Key dependencies missing"
    NEEDS_INSTALL=true
  else
    echo "✅ kosuke-cli dependencies already installed"
  fi

  if [ "$NEEDS_INSTALL" = "true" ]; then
    echo "📦 Installing kosuke-cli dependencies..."
    cd /app/node_modules/@kosuke-ai/cli
    npm install --omit=dev --prefer-offline --no-audit
    cd /app
    echo "✅ kosuke-cli dependencies installed"
  fi
else
  echo "⚠️  kosuke-cli package.json not found, skipping dependency installation"
fi

echo "🚀 Starting application..."

# If running as root, drop to node user for the main process
# Claude Code SDK doesn't allow --dangerously-skip-permissions as root
if [ "$(id -u)" = "0" ]; then
  exec gosu node "$@"
else
  exec "$@"
fi
