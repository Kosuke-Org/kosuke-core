default:
    @just --list

run *args:
    @echo "Running all services with build..."
    @docker compose -f docker-compose.local.yml up --build -d {{args}}
    @just migrate

restart *args:
    @echo "Restarting all services with build..."
    @docker compose -f docker-compose.local.yml restart {{args}}
    @just migrate

logs *args:
    @echo "Fetching logs for all services..."
    @docker compose -f docker-compose.local.yml logs -f {{args}}

build:
    @echo "Building all containers..."
    @docker compose -f docker-compose.local.yml build

up:
    @echo "Starting up all containers..."
    @docker compose -f docker-compose.local.yml up -d --remove-orphans

down *args:
    @echo "Stopping all containers..."
    @docker compose -f docker-compose.local.yml down {{args}}

install:
    @echo "Installing dependencies locally..."
    @bun install --frozen-lockfile

migrate:
    @echo "Migrating database..."
    @docker exec kosuke_nextjs npm run db:migrate

db-reset:
    @echo "Dropping and recreating database..."
    @docker compose -f docker-compose.local.yml down -v
    @docker compose -f docker-compose.local.yml up -d
    @echo "Waiting for PostgreSQL to be ready..."
    @sleep 5
    @docker exec kosuke_nextjs npm run db:migrate
    @echo "Database reset complete!"

build-sandbox kosuke-cli-mode="local" install-chromium="false" npm-token="":
    @if [ "{{kosuke-cli-mode}}" = "production" ] && [ -z "{{npm-token}}" ]; then echo "❌ Error: npm-token is required when kosuke-cli-mode=production"; exit 1; fi
    @echo "Building kosuke-cli..."
    @cd sandbox/kosuke-cli && npm ci && npm run build
    @echo "Building sandbox Docker image for {{kosuke-cli-mode}} with chromium={{install-chromium}}..."
    @export NPM_TOKEN="{{npm-token}}" && docker build \
        --file sandbox/Dockerfile \
        --tag kosuke-sandbox-local:latest \
        --build-arg KOSUKE_CLI_MODE={{kosuke-cli-mode}} \
        --build-arg INSTALL_CHROMIUM={{install-chromium}} \
        --secret id=npm_token,env=NPM_TOKEN \
        sandbox
    @echo "✅ Sandbox build complete! Update SANDBOX_IMAGE=kosuke-sandbox-local:latest in .env"
    @echo "💡 kosuke-cli will be mounted from sandbox/kosuke-cli/ at runtime"

# Link local kosuke-cli for development
link-cli:
    @echo "🔗 Building and linking kosuke-cli..."
    @cd sandbox/kosuke-cli && npm run build && npm link
    @npm link @Kosuke-Org/cli
    @echo "✅ kosuke-cli linked! Run 'just watch-cli' in a separate terminal for hot reload."

# Watch mode for hot reload
watch-cli:
    @echo "👀 Watching kosuke-cli for changes..."
    @cd sandbox/kosuke-cli && npm run build:watch

# Unlink when done (reinstalls published version)
unlink-cli:
    @echo "🔗 Unlinking kosuke-cli..."
    @bun install --frozen-lockfile
    @echo "✅ kosuke-cli unlinked. Reinstalled published version."

# Run a background job programmatically (bypasses queue, runs directly)
run-job job *args:
    @docker exec kosuke_nextjs npm run run-job -- {{job}} {{args}}

# List available jobs
list-jobs:
    @docker exec kosuke_nextjs npm run run-job -- --list

# Preview cleanup - clean inactive sandbox sessions
cleanup-previews *args:
    @docker exec kosuke_nextjs npm run run-job -- preview-cleanup {{args}}
