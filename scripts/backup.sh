#!/bin/bash
# SKH Storage - Database Backup Script
# Usage: ./scripts/backup.sh [backup_dir]

set -e

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/garageStorage_${TIMESTAMP}.sql.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "Starting database backup..."

# Dump PostgreSQL database via Docker
docker exec garage-postgres pg_dump \
  -U postgres \
  -d garageStorage \
  --format=custom \
  --compress=6 \
  > "$BACKUP_DIR/garageStorage_${TIMESTAMP}.dump"

echo "Backup saved to: $BACKUP_DIR/garageStorage_${TIMESTAMP}.dump"

# Also create a plain SQL backup (gzipped)
docker exec garage-postgres pg_dump \
  -U postgres \
  -d garageStorage \
  | gzip > "$BACKUP_FILE"

echo "SQL backup saved to: $BACKUP_FILE"

# Cleanup old backups (keep last 30 days)
find "$BACKUP_DIR" -name "garageStorage_*.dump" -mtime +30 -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "garageStorage_*.sql.gz" -mtime +30 -delete 2>/dev/null || true

echo "Backup complete. Old backups (>30 days) cleaned up."

# List current backups
echo ""
echo "Current backups:"
ls -lh "$BACKUP_DIR"/garageStorage_* 2>/dev/null || echo "  No backups found"
