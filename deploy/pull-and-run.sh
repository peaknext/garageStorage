#!/bin/bash
# ─── Pull images from Docker Hub and start services ─────────────────────────
#
# Prerequisites:
#   1. Docker + Docker Compose installed
#   2. .env.production configured (with IMAGE_REGISTRY set to Docker Hub username/)
#   3. SSL certificates at nginx/ssl/ (auto-generated if missing)
#   4. Internet access to Docker Hub
#
# Usage:
#   bash deploy/pull-and-run.sh              # pulls :latest
#   bash deploy/pull-and-run.sh v1.0.0       # pulls :v1.0.0
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

TAG="${1:-latest}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

echo "=== SKH Storage Service — Pull & Deploy ==="
echo "Image tag: ${TAG}"
echo ""

# ── Pre-flight checks ───────────────────────────────────────────────────────

if [ ! -f "${ENV_FILE}" ]; then
  echo "ERROR: ${ENV_FILE} not found."
  echo ""
  echo "Quick setup:"
  echo "  cp .env.production.example .env.production"
  echo "  ./scripts/generate-secrets.sh --env-file .env.production"
  echo "  # Then edit .env.production — set SERVER_DOMAIN, SERVER_IP, IMAGE_REGISTRY"
  exit 1
fi

# Load IMAGE_REGISTRY from env file
REGISTRY=$(grep -E '^IMAGE_REGISTRY=' "${ENV_FILE}" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
if [ -z "${REGISTRY}" ]; then
  echo "ERROR: IMAGE_REGISTRY is not set in ${ENV_FILE}"
  echo ""
  echo "Set it to your Docker Hub username with trailing slash, e.g.:"
  echo "  IMAGE_REGISTRY=peaknext/"
  echo ""
  echo "This produces image names like:"
  echo "  peaknext/skh-storage-api:${TAG}"
  echo "  peaknext/skh-admin-ui:${TAG}"
  exit 1
fi

echo "Registry:  ${REGISTRY}"
echo "Images:    ${REGISTRY}skh-storage-api:${TAG}"
echo "           ${REGISTRY}skh-admin-ui:${TAG}"
echo ""

# SSL check
if [ ! -f nginx/ssl/fullchain.pem ] || [ ! -f nginx/ssl/privkey.pem ]; then
  echo "WARNING: SSL certificates not found in nginx/ssl/"
  if [ -f scripts/ssl-setup.sh ]; then
    read -p "Generate self-signed cert now? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      bash scripts/ssl-setup.sh
    fi
  else
    echo "Run: ./scripts/ssl-setup.sh"
  fi
fi

# Generate Garage config if needed
# Remove if accidentally created as directory
if [ -d garage/garage.active.toml ]; then
  rm -rf garage/garage.active.toml
fi

if [ ! -f garage/garage.active.toml ] && [ -f garage/garage.prod.toml ]; then
  echo "Generating Garage config from template..."
  set -a
  source "${ENV_FILE}"
  set +a
  envsubst < garage/garage.prod.toml > garage/garage.active.toml
  echo "Created garage/garage.active.toml"
  # Verify secrets were substituted
  if grep -q 'rpc_secret = ""' garage/garage.active.toml; then
    echo "ERROR: GARAGE_RPC_SECRET was not substituted. Check ${ENV_FILE}"
    exit 1
  fi
fi

# ── Step 1: Pull images ─────────────────────────────────────────────────────
echo ""
echo "1/4 — Pulling images from Docker Hub..."
IMAGE_TAG="${TAG}" docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" pull storage-api admin-ui

# ── Step 2: Stop existing services ──────────────────────────────────────────
echo ""
echo "2/4 — Stopping existing services (if any)..."
IMAGE_TAG="${TAG}" docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" down 2>/dev/null || true

# ── Step 3: Database + migrations ────────────────────────────────────────────
echo ""
echo "3/4 — Starting infrastructure and running migrations..."

# Start infrastructure services first
IMAGE_TAG="${TAG}" docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d postgres redis garage

echo "Waiting for database to be ready..."
for i in $(seq 1 30); do
  if IMAGE_TAG="${TAG}" docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
    exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "Database is ready."
    break
  fi
  echo "  Waiting... ($i/30)"
  sleep 2
done

# Check if this is first run (Garage key setup needed)
GARAGE_KEY=$(grep -E '^GARAGE_ACCESS_KEY=' "${ENV_FILE}" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
if [ -z "${GARAGE_KEY}" ] || [ "${GARAGE_KEY}" = "CHANGE_ME" ]; then
  echo ""
  echo "=== First-time Garage Setup ==="
  echo "Waiting for Garage to start..."
  sleep 15

  # Assign storage layout (required before any key/bucket operations)
  echo "Configuring Garage storage layout..."
  NODE_ID=$(docker exec skh-garage /garage status 2>/dev/null | grep -oP '^[a-f0-9]+' | head -1 || true)
  if [ -n "${NODE_ID}" ]; then
    docker exec skh-garage /garage layout assign -z dc1 -c ${GARAGE_CAPACITY:-10GB} "${NODE_ID}" 2>/dev/null || true
    # Get current layout version and apply next
    LAYOUT_VER=$(docker exec skh-garage /garage layout show 2>/dev/null | grep -oP 'apply --version \K[0-9]+' || echo "1")
    docker exec skh-garage /garage layout apply --version "${LAYOUT_VER}" 2>/dev/null || true
    echo "Storage layout configured."
  else
    echo "WARNING: Could not detect Garage node ID."
  fi

  echo "Creating Garage API key..."
  docker exec skh-garage /garage key create storage-api-key 2>/dev/null || {
    echo "WARNING: Could not create Garage key automatically."
    echo "Run manually: docker exec skh-garage /garage key create storage-api-key"
    echo "Then update GARAGE_ACCESS_KEY and GARAGE_SECRET_KEY in ${ENV_FILE}"
  }
  echo ""
  echo ">>> IMPORTANT: Copy the Access Key and Secret Key above"
  echo ">>> Edit ${ENV_FILE} and set GARAGE_ACCESS_KEY and GARAGE_SECRET_KEY"
  echo ">>> Then re-run: bash deploy/pull-and-run.sh ${TAG}"
  echo ""
  read -p "Press Enter after updating ${ENV_FILE}, or Ctrl+C to exit... "
  # Reload env after user updates
  source "${ENV_FILE}"
fi

# Run migrations
echo "Running database migrations..."
IMAGE_TAG="${TAG}" docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
  run --rm storage-api npx prisma migrate deploy || {
    echo "WARNING: Migration failed. Check logs above."
  }

echo "Running database seed..."
IMAGE_TAG="${TAG}" docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" \
  run --rm storage-api npx prisma db seed || {
    echo "NOTE: Seed may have already been applied (this is normal on updates)."
  }

# ── Step 4: Start all services ──────────────────────────────────────────────
echo ""
echo "4/4 — Starting all services..."
IMAGE_TAG="${TAG}" docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d

# ── Health check ─────────────────────────────────────────────────────────────
echo ""
echo "Waiting for services to start (30s)..."
sleep 30

echo ""
echo "Service status:"
IMAGE_TAG="${TAG}" docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps

echo ""
HTTPS_PORT=$(grep -E '^NGINX_HTTPS_PORT=' "${ENV_FILE}" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "8443")
HTTP_PORT=$(grep -E '^NGINX_HTTP_PORT=' "${ENV_FILE}" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "8080")
if curl -sf -k "https://localhost:${HTTPS_PORT}/api/v1/health" > /dev/null 2>&1; then
  echo "=== Deployment successful! ==="
  echo ""
  SERVER=$(grep -E '^SERVER_DOMAIN=' "${ENV_FILE}" 2>/dev/null | cut -d= -f2- | tr -d '"' || hostname -f 2>/dev/null || echo 'your-server-ip')
  PORT_SUFFIX=""
  [ "${HTTPS_PORT}" != "443" ] && PORT_SUFFIX=":${HTTPS_PORT}"
  echo "Access: https://${SERVER}${PORT_SUFFIX}"
elif curl -sf http://localhost:9001/health > /dev/null 2>&1; then
  echo "=== API is running (nginx may need SSL certificates) ==="
  echo "Check: docker logs skh-nginx --tail 20"
else
  echo "=== WARNING: Health check failed ==="
  echo "Check logs:"
  echo "  docker logs skh-storage-api --tail 30"
  echo "  docker logs skh-nginx --tail 20"
fi
