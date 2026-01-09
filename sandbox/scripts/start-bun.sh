#!/bin/bash
set -e

# ============================================================
# BUN SERVICE STARTER
# Uses KOSUKE_BUN_DIR from entrypoint, installs deps, starts server
# ============================================================

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

# Database commands from config (with fallbacks for backward compatibility)
DB_MIGRATE_CMD="${KOSUKE_BUN_DB_MIGRATE_CMD:-db:migrate}"
DB_SEED_CMD="${KOSUKE_BUN_DB_SEED_CMD:-db:seed}"

# Helper to run npm script only if it exists in package.json
run_script_if_exists() {
    local script_name=$1
    if grep -q "\"$script_name\":" package.json 2>/dev/null; then
        bun run "$script_name"
    else
        echo "ℹ️ Script '$script_name' not found in package.json, skipping"
    fi
}

echo "🗄️ Running database migrations ($DB_MIGRATE_CMD)..."
run_script_if_exists "$DB_MIGRATE_CMD"

# Seed database (only in development, and only if not already seeded)
if [ "$KOSUKE_MODE" != "production" ]; then
    SEED_MARKER="/tmp/.kosuke-db-seeded"
    if [ ! -f "$SEED_MARKER" ]; then
        echo "🌱 Seeding database ($DB_SEED_CMD)..."
        run_script_if_exists "$DB_SEED_CMD"
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
