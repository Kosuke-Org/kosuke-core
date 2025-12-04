#!/bin/sh
set -e

echo "📦 Bun version: $(bun -v)"

# Check if package.json exists (should exist from GitHub template)
if [ ! -f "package.json" ]; then
  echo "❌ No package.json found. Project should be initialized via GitHub template."
  echo "🔗 Get started at: https://github.com/Kosuke-Org/kosuke-template"
  exit 1
fi

echo "📁 Working directory: $(pwd)"

echo "📦 Installing dependencies..."
bun install --silent --frozen-lockfile
echo "📦 Dependencies installed"

# Check mode: production (main branch) vs development (feature branches)
if [ "$KOSUKE_MODE" = "production" ]; then
  echo "🏭 Running in PRODUCTION mode"

  # Run database migrations (not reset)
  echo "🗄️ Running database migrations..."
  bun run db:migrate

  # Build for production
  echo "🔨 Building application..."
  bun run build

  # Start production server
  echo "🚀 Starting production server..."
  exec bun run start -- -H 0.0.0.0
else
  echo "🛠️ Running in DEVELOPMENT mode"

  # Run database reset (drops and recreates)
  echo "🗄️ Setting up database schema..."
  bun run db:reset

  # Execute the command passed to docker run (default: bun run dev)
  echo "🚀 Starting development server..."
  exec "$@"
fi
