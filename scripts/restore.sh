#!/bin/bash
# SKH Storage - Database Restore Script
# Usage: ./scripts/restore.sh <backup_file>
#
# Supports both .dump (custom format) and .sql.gz (compressed SQL)

set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>"
  echo ""
  echo "Available backups:"
  ls -lh ./backups/garageStorage_* 2>/dev/null || echo "  No backups found in ./backups/"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will replace all data in the garageStorage database!"
read -p "Are you sure? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "Restoring from: $BACKUP_FILE"

if [[ "$BACKUP_FILE" == *.dump ]]; then
  # Custom format restore
  cat "$BACKUP_FILE" | docker exec -i garage-postgres pg_restore \
    -U postgres \
    -d garageStorage \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges
elif [[ "$BACKUP_FILE" == *.sql.gz ]]; then
  # Compressed SQL restore
  gunzip -c "$BACKUP_FILE" | docker exec -i garage-postgres psql \
    -U postgres \
    -d garageStorage
else
  echo "Error: Unsupported backup format. Use .dump or .sql.gz"
  exit 1
fi

echo "Restore complete!"
echo ""
echo "IMPORTANT: Restart the storage-api service to clear caches:"
echo "  docker compose restart storage-api"
