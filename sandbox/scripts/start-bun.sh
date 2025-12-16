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
# START SERVER
# ============================================================

if [ "$KOSUKE_MODE" = "production" ]; then
    echo "📦 Running production build..."
    NODE_OPTIONS="--max-old-space-size=1024" bun run build
    echo "▶️ Starting production server..."
    exec bun run start
else
    echo "▶️ Starting development server..."
    exec bun run dev
fi
