default:
    @just --list

run *args:
    @echo "Running all services with build..."
    @docker compose -f docker-compose.local.yml up --build -d {{args}}
    @just migrate

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

watch-agent:
    @echo "👀 Starting kosuke-cli watch mode..."
    @echo "   Edit .ts files → Auto-rebuild → Auto-restart in container"
    @cd sandbox/kosuke-cli && npm run build:watch
