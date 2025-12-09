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
# STEP 1: CLONE OR PULL REPOSITORY
# ============================================================

if [ -z "$KOSUKE_REPO_URL" ]; then
    echo "❌ Error: KOSUKE_REPO_URL is required"
    exit 1
fi

BRANCH="${KOSUKE_BRANCH:-main}"

echo "📦 Syncing repository..."
echo "   URL: $KOSUKE_REPO_URL"
echo "   Branch: $BRANCH"

# Build authenticated URL if token provided
if [ -n "$KOSUKE_GITHUB_TOKEN" ]; then
    REPO_PATH=$(echo "$KOSUKE_REPO_URL" | sed -E 's|https://github.com/||' | sed 's|.git$||')
    AUTH_URL="https://x-access-token:${KOSUKE_GITHUB_TOKEN}@github.com/${REPO_PATH}.git"
else
    AUTH_URL="$KOSUKE_REPO_URL"
fi

cd /app

# Check if project already has a git repo (container restart scenario)
if [ -d "project/.git" ]; then
    echo "📥 Existing repo found, pulling latest changes..."
    cd /app/project

    # Temporarily set authenticated URL for fetch
    git remote set-url origin "$AUTH_URL"

    # Fetch and reset to latest (preserves node_modules, .venv, etc.)
    if ! git fetch origin "$BRANCH" --depth 1 2>&1; then
        echo "⚠️ Fetch failed, doing fresh clone..."
        cd /app
        rm -rf project
        mkdir -p project
        git clone --depth 1 --branch "$BRANCH" "$AUTH_URL" project
        cd /app/project
    else
        # Reset to fetched branch (discards local changes)
        git reset --hard "origin/$BRANCH"
        echo "✅ Repository updated"
    fi
else
    echo "📦 Fresh clone..."
    rm -rf project
    mkdir -p project

    # Always clone main branch first
    if ! git clone --depth 1 --branch main "$AUTH_URL" project 2>&1; then
        echo "❌ Error: Failed to clone repository"
        exit 1
    fi
    cd /app/project

    # If target branch is not main, create/checkout it
    if [ "$BRANCH" != "main" ]; then
        echo "🌿 Creating branch: $BRANCH"
        git checkout -b "$BRANCH"
    fi

    echo "✅ Repository cloned (branch: $BRANCH)"
fi

# Configure git user (for commits)
git config user.name "Kosuke Bot"
git config user.email "bot@kosuke.dev"

# Store original URL (without token) for display
git remote set-url origin "$KOSUKE_REPO_URL"

# ============================================================
# STEP 2: READ AND PARSE KOSUKE CONFIG
# ============================================================

CONFIG_FILE="/app/project/kosuke.config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Error: kosuke.config.json not found in repository"
    exit 1
fi

echo "📋 Parsing config file: $CONFIG_FILE"

# Parse config using Node.js script (writes to /tmp/kosuke.env)
node /app/scripts/parse-config.js

# Source the generated .env file
set -a
source /tmp/kosuke.env
set +a

echo "   Bun directory: ${KOSUKE_BUN_DIR:-none}"
echo "   Python directory: ${KOSUKE_PYTHON_DIR:-none}"
echo "   Has Redis: ${KOSUKE_HAS_REDIS}"

# ============================================================
# STEP 3: CREATE POSTGRES DATABASE (if configured)
# ============================================================

if [ -n "$KOSUKE_POSTGRES_URL" ]; then
    echo "🐘 Creating Postgres database if needed..."

    # Extract database name from URL (last path segment)
    DB_NAME=$(echo "$KOSUKE_POSTGRES_URL" | sed -E 's|.*/([^/]+)$|\1|')

    # Build admin URL (replace database name with 'postgres')
    ADMIN_URL=$(echo "$KOSUKE_POSTGRES_URL" | sed -E 's|/[^/]+$|/postgres|')

    echo "   Database: $DB_NAME"

    # Check if database exists, create if not
    # Using psql with the admin database
    if psql "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
        echo "   Database already exists"
    else
        echo "   Creating database..."
        if psql "$ADMIN_URL" -c "CREATE DATABASE \"$DB_NAME\"" 2>&1; then
            echo "✅ Database created: $DB_NAME"
        else
            echo "⚠️ Warning: Could not create database (may already exist)"
        fi
    fi
else
    echo "ℹ️ Postgres not configured, skipping"
fi

# ============================================================
# STEP 4: START REDIS (if configured)
# ============================================================

if [ "$KOSUKE_HAS_REDIS" = "true" ]; then
    echo "🔴 Starting Redis..."
    redis-server /etc/redis/redis.conf --daemonize yes

    # Wait for Redis to be ready
    REDIS_RETRIES=0
    until redis-cli ping > /dev/null 2>&1; do
        REDIS_RETRIES=$((REDIS_RETRIES + 1))
        if [ $REDIS_RETRIES -gt 30 ]; then
            echo "❌ Error: Redis failed to start"
            exit 1
        fi
        echo "   Waiting for Redis... (attempt $REDIS_RETRIES)"
        sleep 1
    done
    echo "✅ Redis is ready"
else
    echo "ℹ️ Redis not configured, skipping"
fi

# ============================================================
# STEP 5: START SERVICES VIA SUPERVISOR
# ============================================================

echo "🚀 Starting services via supervisor..."

# Start supervisor (env vars are inherited by child processes)
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
