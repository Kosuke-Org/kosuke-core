#!/bin/bash
set -e

# ============================================================
# PYTHON SERVICE STARTER
# Uses KOSUKE_PYTHON_DIR from entrypoint, installs deps, starts server
# ============================================================

# Skip if agent-only mode
if [ "$KOSUKE_SERVICES_MODE" = "agent-only" ]; then
    echo "ℹ️ Agent-only mode: Python service disabled"
    exec tail -f /dev/null
fi

# Check if python service is configured
if [ -z "$KOSUKE_PYTHON_DIR" ]; then
    echo "ℹ️ No Python service defined in config, exiting"
    exec tail -f /dev/null
fi

cd "/app/project/$KOSUKE_PYTHON_DIR"

echo "🐍 Python service directory: $(pwd)"
echo "   Mode: $KOSUKE_MODE"

# ============================================================
# INSTALL DEPENDENCIES
# ============================================================

echo "📦 Installing Python dependencies with uv..."
uv sync --frozen
echo "✅ Python dependencies installed"

# Activate virtual environment (created by uv sync)
source .venv/bin/activate

# ============================================================
# DETERMINE MAIN MODULE
# ============================================================

MAIN_MODULE=""
if [ -f "main.py" ]; then
    MAIN_MODULE="main:app"
elif [ -f "app.py" ]; then
    MAIN_MODULE="app:app"
elif [ -f "server.py" ]; then
    MAIN_MODULE="server:app"
fi

if [ -z "$MAIN_MODULE" ]; then
    echo "⚠️ No main.py, app.py, or server.py found"
    exec tail -f /dev/null
fi

echo "▶️ Starting uvicorn with module: $MAIN_MODULE"

# ============================================================
# START SERVER
# ============================================================

if [ "$KOSUKE_MODE" = "production" ]; then
    exec uvicorn $MAIN_MODULE --host 0.0.0.0 --port $SANDBOX_PYTHON_PORT
else
    exec uvicorn $MAIN_MODULE --host 0.0.0.0 --port $SANDBOX_PYTHON_PORT --reload
fi
