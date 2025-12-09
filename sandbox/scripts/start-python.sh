#!/bin/bash
set -e

# ============================================================
# PYTHON SERVICE STARTER
# Uses KOSUKE_PYTHON_DIR from entrypoint, installs deps, starts server
# ============================================================

# Check if python service is configured
if [ -z "$KOSUKE_PYTHON_DIR" ]; then
    echo "ℹ️ No Python service defined in config, exiting"
    exec tail -f /dev/null
fi

cd "/app/project/$KOSUKE_PYTHON_DIR"

echo "🐍 Python service directory: $(pwd)"
echo "   Mode: $KOSUKE_MODE"

# ============================================================
# CHECK FOR REQUIREMENTS.TXT
# ============================================================

if [ ! -f "requirements.txt" ]; then
    echo "⚠️ No requirements.txt found, nothing to start"
    exec tail -f /dev/null
fi

# ============================================================
# INSTALL DEPENDENCIES (if not already done)
# ============================================================

DEPS_MARKER=".kosuke-deps-installed"

if [ ! -f "$DEPS_MARKER" ]; then
    echo "📦 Installing Python dependencies..."

    # Create virtual environment if it doesn't exist
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
    fi

    # Activate and install
    source .venv/bin/activate
    pip install --quiet -r requirements.txt

    touch "$DEPS_MARKER"
    echo "✅ Python dependencies installed"
else
    echo "✅ Dependencies already installed"
    source .venv/bin/activate
fi

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
    exec uvicorn $MAIN_MODULE --host 0.0.0.0 --port 8000 --workers 2
else
    exec uvicorn $MAIN_MODULE --host 0.0.0.0 --port 8000 --reload
fi
