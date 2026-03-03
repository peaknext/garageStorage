#!/bin/bash
# SKH Storage - Build and Export for Offline Deployment
# Usage: ./scripts/build-and-export.sh [output_dir]
#
# Builds all Docker images, exports them to tar.gz files,
# and packages everything needed for offline deployment.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DEPLOY_DIR="${1:-./deploy}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_DIR="$DEPLOY_DIR/skh-storage-$TIMESTAMP"

echo "=========================================="
echo "  SKH Storage - Build and Export"
echo "=========================================="
echo "Output: $EXPORT_DIR"
echo ""

# Step 1: Build Docker images
echo "[1/5] Building Docker images..."
docker compose -f docker-compose.prod.yml build storage-api admin-ui
echo "  Done."
echo ""

# Step 2: Tag images with timestamp
echo "[2/5] Tagging images..."
docker tag skh-storage-api:latest skh-storage-api:$TIMESTAMP
docker tag skh-admin-ui:latest skh-admin-ui:$TIMESTAMP
echo "  skh-storage-api:$TIMESTAMP"
echo "  skh-admin-ui:$TIMESTAMP"
echo ""

# Step 3: Export images to tar.gz
echo "[3/5] Exporting Docker images (this may take a few minutes)..."
mkdir -p "$EXPORT_DIR/images"

echo "  Saving skh-storage-api..."
docker save skh-storage-api:latest | gzip > "$EXPORT_DIR/images/skh-storage-api.tar.gz"

echo "  Saving skh-admin-ui..."
docker save skh-admin-ui:latest | gzip > "$EXPORT_DIR/images/skh-admin-ui.tar.gz"

echo "  Saving dxflrs/garage:v2.1.0..."
docker save dxflrs/garage:v2.1.0 | gzip > "$EXPORT_DIR/images/garage.tar.gz"

echo "  Saving postgres:16-alpine..."
docker save postgres:16-alpine | gzip > "$EXPORT_DIR/images/postgres.tar.gz"

echo "  Saving redis:7-alpine..."
docker save redis:7-alpine | gzip > "$EXPORT_DIR/images/redis.tar.gz"

echo "  Saving nginx:1.25-alpine..."
docker save nginx:1.25-alpine | gzip > "$EXPORT_DIR/images/nginx.tar.gz"

echo "  Done."
echo ""

# Step 4: Copy configuration files
echo "[4/5] Copying configuration files..."

# Docker compose and env
cp docker-compose.prod.yml "$EXPORT_DIR/"
cp .env.production.example "$EXPORT_DIR/"

# Nginx config
mkdir -p "$EXPORT_DIR/nginx/ssl"
cp nginx/nginx.conf "$EXPORT_DIR/nginx/"

# Garage config
mkdir -p "$EXPORT_DIR/garage"
cp garage/garage.prod.toml "$EXPORT_DIR/garage/"

# Scripts
mkdir -p "$EXPORT_DIR/scripts"
cp scripts/import-and-run.sh "$EXPORT_DIR/scripts/"
cp scripts/generate-secrets.sh "$EXPORT_DIR/scripts/"
cp scripts/ssl-setup.sh "$EXPORT_DIR/scripts/"
cp scripts/backup.sh "$EXPORT_DIR/scripts/"
cp scripts/restore.sh "$EXPORT_DIR/scripts/"
cp scripts/setup-garage.sh "$EXPORT_DIR/scripts/"
chmod +x "$EXPORT_DIR/scripts/"*.sh

# Prisma migrations (needed for database setup)
mkdir -p "$EXPORT_DIR/backend/prisma"
cp -r backend/prisma/migrations "$EXPORT_DIR/backend/prisma/" 2>/dev/null || true
cp backend/prisma/schema.prisma "$EXPORT_DIR/backend/prisma/"

echo "  Done."
echo ""

# Step 5: Create final archive
echo "[5/5] Creating deployment archive..."
cd "$DEPLOY_DIR"
tar -czf "skh-storage-$TIMESTAMP.tar.gz" "skh-storage-$TIMESTAMP/"

# Calculate sizes
ARCHIVE_SIZE=$(du -sh "skh-storage-$TIMESTAMP.tar.gz" | cut -f1)
DIR_SIZE=$(du -sh "skh-storage-$TIMESTAMP/" | cut -f1)

echo ""
echo "=========================================="
echo "  Build and Export Complete!"
echo "=========================================="
echo ""
echo "Archive:   $DEPLOY_DIR/skh-storage-$TIMESTAMP.tar.gz ($ARCHIVE_SIZE)"
echo "Directory: $DEPLOY_DIR/skh-storage-$TIMESTAMP/ ($DIR_SIZE)"
echo ""
echo "Transfer to production server:"
echo "  scp $DEPLOY_DIR/skh-storage-$TIMESTAMP.tar.gz user@server:/opt/"
echo ""
echo "On the production server:"
echo "  cd /opt"
echo "  tar -xzf skh-storage-$TIMESTAMP.tar.gz"
echo "  cd skh-storage-$TIMESTAMP"
echo "  bash scripts/import-and-run.sh"
