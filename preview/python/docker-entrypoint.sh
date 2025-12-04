#!/bin/bash
set -e

# Check if pyproject.toml exists (should exist from GitHub template)
if [ ! -f "pyproject.toml" ]; then
  echo "❌ No pyproject.toml found. Ensure your project has a pyproject.toml file."
  exit 1
fi

# 1. Create the virtual environment if it doesn't exist
if [ ! -f ".venv/pyvenv.cfg" ]; then
    echo "Creating virtual environment..."
    uv venv
fi

# 2. Install dependencies into the .venv
echo "Installing dependencies..."
uv pip install --no-cache -r pyproject.toml

# Check mode: production (main branch) vs development (feature branches)
if [ "$KOSUKE_MODE" = "production" ]; then
  echo "🏭 Running in PRODUCTION mode"
  # Start uvicorn WITHOUT --reload for production
  exec uvicorn main:app --host 0.0.0.0 --port 8000
else
  echo "🛠️ Running in DEVELOPMENT mode"
  # Execute the main command (default: uvicorn with --reload)
  exec "$@"
fi
