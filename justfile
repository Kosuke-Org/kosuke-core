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

build-sandbox:
    @echo "Building sandbox agent..."
    @cd sandbox/agent && bun install --frozen-lockfile && bun run build
    @echo "Building sandbox Docker image..."
    @cd sandbox && docker build -t kosuke-sandbox-local:latest .
    @echo "Sandbox build complete! Update the SANDBOX_IMAGE in .env to use the new image."
