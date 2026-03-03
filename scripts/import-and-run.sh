#!/bin/bash
# SKH Storage - Import and Run (Offline Deployment)
# Usage: ./scripts/import-and-run.sh
#
# Loads Docker images from tar files, configures the environment,
# runs database migrations, and starts all services.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"

echo "=========================================="
echo "  SKH Storage - Import and Run"
echo "=========================================="
echo ""

# ============================================
# Step 1: Load Docker images
# ============================================
echo "[1/7] Loading Docker images..."
if [ -d "images" ]; then
  for img in images/*.tar.gz; do
    if [ -f "$img" ]; then
      echo "  Loading $(basename "$img")..."
      docker load < "$img"
    fi
  done
  echo "  Done."
else
  echo "  No images/ directory found. Skipping image loading."
  echo "  (Images must already be available on this machine)"
fi
echo ""

# ============================================
# Step 2: Configure environment
# ============================================
echo "[2/7] Checking environment configuration..."
if [ ! -f "$ENV_FILE" ]; then
  echo "  No $ENV_FILE found. Creating from template..."
  cp .env.production.example "$ENV_FILE"
  echo ""

  echo "  Generating secrets..."
  bash scripts/generate-secrets.sh --env-file "$ENV_FILE"
  echo ""

  echo "  ============================================"
  echo "  IMPORTANT: Edit $ENV_FILE before continuing!"
  echo "  ============================================"
  echo "  Required settings:"
  echo "    - SERVER_DOMAIN (your domain name)"
  echo "    - SERVER_IP (your server's IP address)"
  echo "    - GARAGE_PUBLIC_ENDPOINT (http://YOUR_SERVER_IP:9004)"
  echo "    - API_BASE_URL (https://YOUR_DOMAIN or http://YOUR_IP:9001)"
  echo ""
  echo "  GARAGE_ACCESS_KEY and GARAGE_SECRET_KEY will be set in Step 6."
  echo ""
  read -p "  Press Enter after editing $ENV_FILE... "
else
  echo "  Found existing $ENV_FILE"
fi
echo ""

# Load environment variables
set -a
source "$ENV_FILE"
set +a

# ============================================
# Step 3: Process Garage configuration
# ============================================
echo "[3/7] Configuring Garage S3 storage..."
if [ -f "garage/garage.prod.toml" ]; then
  if command -v envsubst &> /dev/null; then
    envsubst < garage/garage.prod.toml > garage/garage.active.toml
    echo "  Generated garage/garage.active.toml from template"
  else
    # Fallback: use sed for substitution
    cp garage/garage.prod.toml garage/garage.active.toml
    sed -i "s|\${GARAGE_RPC_SECRET}|${GARAGE_RPC_SECRET}|g" garage/garage.active.toml
    sed -i "s|\${GARAGE_ADMIN_TOKEN}|${GARAGE_ADMIN_TOKEN}|g" garage/garage.active.toml
    sed -i "s|\${GARAGE_METRICS_TOKEN}|${GARAGE_METRICS_TOKEN}|g" garage/garage.active.toml
    echo "  Generated garage/garage.active.toml (using sed fallback)"
  fi
else
  echo "  WARNING: garage/garage.prod.toml not found."
  echo "  Using existing garage.toml or garage.active.toml"
fi
echo ""

# ============================================
# Step 4: SSL certificates
# ============================================
echo "[4/7] Checking SSL certificates..."
if [ ! -f "nginx/ssl/fullchain.pem" ] || [ ! -f "nginx/ssl/privkey.pem" ]; then
  echo "  No SSL certificates found. Generating self-signed..."
  bash scripts/ssl-setup.sh self-signed
else
  echo "  SSL certificates found."
fi
echo ""

# ============================================
# Step 5: Start infrastructure services
# ============================================
echo "[5/7] Starting infrastructure services (postgres, redis, garage)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis garage
echo "  Waiting for services to be healthy..."
sleep 15

# Wait for postgres to be ready
echo "  Checking PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec skh-postgres pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-garageStorage}" &>/dev/null; then
    echo "  PostgreSQL is ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  ERROR: PostgreSQL did not become ready in time."
    echo "  Check logs: docker logs skh-postgres"
    exit 1
  fi
  sleep 2
done
echo ""

# ============================================
# Step 6: Initialize Garage (first run)
# ============================================
echo "[6/7] Initializing Garage storage..."
if [ -z "$GARAGE_ACCESS_KEY" ] || [ "$GARAGE_ACCESS_KEY" = "" ]; then
  echo "  Creating Garage API key..."
  echo "  Run this command to create the key:"
  echo ""
  echo "    docker exec skh-garage /garage key create storage-api-key"
  echo ""
  echo "  Then update $ENV_FILE with the GARAGE_ACCESS_KEY and GARAGE_SECRET_KEY values."
  echo ""
  read -p "  Press Enter after updating $ENV_FILE with Garage keys... "

  # Reload env
  set -a
  source "$ENV_FILE"
  set +a
else
  echo "  Garage API key already configured."
fi

# Apply Garage node layout
echo "  Configuring Garage node layout..."
NODE_ID=$(docker exec skh-garage /garage status 2>/dev/null | grep "this node" | awk '{print $3}' | head -c 16) || true
if [ -n "$NODE_ID" ]; then
  docker exec skh-garage /garage layout assign "$NODE_ID" -z dc1 -c 1G 2>/dev/null || true
  docker exec skh-garage /garage layout apply --version 1 2>/dev/null || true
  echo "  Node layout configured."
else
  echo "  Could not detect node ID. Layout may need manual configuration."
  echo "  See: docker exec skh-garage /garage status"
fi
echo ""

# ============================================
# Step 7: Run migrations and start all services
# ============================================
echo "[7/7] Running database migrations and starting all services..."

# Run Prisma migrations
echo "  Running database migrations..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm storage-api \
  npx prisma migrate deploy 2>&1 || {
    echo "  WARNING: Migration may have failed. Check if this is a fresh install."
    echo "  You can run migrations manually later:"
    echo "    docker compose -f $COMPOSE_FILE --env-file $ENV_FILE run --rm storage-api npx prisma migrate deploy"
  }

# Seed database (only on first run, safe to re-run)
echo "  Seeding database..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm storage-api \
  npx prisma db seed 2>&1 || {
    echo "  Note: Seed may have already been applied."
  }

# Start all services
echo "  Starting all services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
echo "Services:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Access the admin dashboard at:"
if [ "${ENABLE_SSL}" = "true" ]; then
  echo "  https://${SERVER_DOMAIN:-localhost}"
else
  echo "  http://${SERVER_DOMAIN:-${SERVER_IP:-localhost}}"
fi
echo ""
echo "Default admin credentials:"
echo "  Email:    admin@example.com"
echo "  Password: admin123"
echo ""
echo "  >>> CHANGE THE DEFAULT PASSWORD IMMEDIATELY! <<<"
echo ""
echo "Useful commands:"
echo "  View logs:   docker logs skh-storage-api -f"
echo "  View status: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE ps"
echo "  Stop:        docker compose -f $COMPOSE_FILE --env-file $ENV_FILE down"
echo "  Backup:      ./scripts/backup.sh ./backups"
