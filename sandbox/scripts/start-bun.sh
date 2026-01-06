#!/bin/bash
set -e

# ============================================================
# BUN SERVICE STARTER
# Uses KOSUKE_BUN_DIR from entrypoint, installs deps, starts server
# ============================================================

# Skip if agent-only mode
if [ "$KOSUKE_SERVICES_MODE" = "agent-only" ]; then
    echo "ℹ️ Agent-only mode: Bun service disabled"
    exec tail -f /dev/null
fi

# Check if bun service is configured
if [ -z "$KOSUKE_BUN_DIR" ]; then
    echo "ℹ️ No Bun service defined in config, exiting"
    exec tail -f /dev/null
fi

cd "/app/project/$KOSUKE_BUN_DIR"

echo "🚀 Bun service directory: $(pwd)"
echo "   Mode: $KOSUKE_MODE"

# ============================================================
# CHECK FOR PACKAGE.JSON
# ============================================================

if [ ! -f "package.json" ]; then
    echo "⚠️ No package.json found, nothing to start"
    exec tail -f /dev/null
fi

# ============================================================
# INSTALL DEPENDENCIES
# ============================================================

echo "📦 Installing Bun dependencies..."
bun install --frozen-lockfile
echo "✅ Dependencies installed"

# ============================================================
# DATABASE SETUP
# ============================================================

if [ "$KOSUKE_MODE" = "production" ]; then
    echo "🗄️ Running database migrations..."
    bun run db:migrate
else
    echo "🗄️ Setting up development database..."

    # Run migrations first
    bun run db:migrate

    # Seed database (only if not already seeded)
    SEED_MARKER="/tmp/.kosuke-db-seeded"
    if [ ! -f "$SEED_MARKER" ]; then
        echo "🌱 Seeding database..."
        bun run db:seed
        touch "$SEED_MARKER"
    else
        echo "✅ Database already seeded"
    fi
fi

# ============================================================
# START SERVER
# ============================================================

if [ "$KOSUKE_MODE" = "production" ]; then
    echo "📦 Running production build..."
    bun run build
    echo "▶️ Starting production server on port $SANDBOX_BUN_PORT..."
    exec bun run start -- -p $SANDBOX_BUN_PORT
else
    echo "▶️ Starting development server on port $SANDBOX_BUN_PORT..."
    exec bun run dev -- -p $SANDBOX_BUN_PORT
fi
