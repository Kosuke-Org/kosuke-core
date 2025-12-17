#!/bin/bash
set -e

# ============================================================
# KOSUKE CLI AGENT STARTER
# Runs kosuke serve for agent API
# ============================================================

echo "🤖 Starting Kosuke CLI Agent..."
echo "   Mode: ${KOSUKE_MODE}"
echo "   Port: ${PORT}"
echo "   Project: ${PROJECT_DIR}"

# ============================================================
# START KOSUKE SERVE
# ============================================================

# Agent should work from any directory, but we set cwd to project
cd "${PROJECT_DIR}"

# Check if kosuke-cli is mounted (local development)
if [ -d "/app/kosuke-cli" ]; then
    # Local development: use mounted compiled code with auto-restart
    echo "🔧 Local development: using mounted kosuke-cli with hot-reload"

    cd /app/kosuke-cli

    # Link the CLI so 'kosuke' command is available
    if ! command -v kosuke &> /dev/null; then
        echo "🔗 Linking kosuke CLI..."
        npm link --force
    fi

    cd "${PROJECT_DIR}"
    echo "▶️ Starting kosuke serve with nodemon (hot-reload)..."
    echo "💡 Run 'cd sandbox/kosuke-cli && npm run build:watch' on host for hot-reload"
    exec npx nodemon \
        --watch /app/kosuke-cli/dist \
        --ext js \
        --exec "kosuke serve --port=${PORT}"
else
    # Production: use globally installed package
    echo "📦 Production: using installed @Kosuke-Org/cli from npm"

    # Verify kosuke is installed
    if ! command -v kosuke &> /dev/null; then
        echo "❌ Error: kosuke CLI not found in PATH"
        echo "   Make sure @Kosuke-Org/cli is installed globally"
        exit 1
    fi

    echo "▶️ Starting kosuke serve (npm package)..."
    exec kosuke serve --port=${PORT}
fi

