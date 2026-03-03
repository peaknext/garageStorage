#!/bin/bash
# SKH Storage - Production Secret Generator
# Usage: ./scripts/generate-secrets.sh [--env-file <path>]
#
# Generates cryptographically strong random secrets for all services.
# Can output to stdout or write directly to an .env file.

set -e

ENV_FILE=""
MODE="stdout"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file)
      ENV_FILE="$2"
      MODE="file"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--env-file <path>]"
      echo ""
      echo "Options:"
      echo "  --env-file <path>  Write secrets to specified file (updates existing values)"
      echo "  --help             Show this help message"
      echo ""
      echo "Without --env-file, secrets are printed to stdout."
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check for openssl
if ! command -v openssl &> /dev/null; then
  echo "Error: openssl is required but not installed."
  echo "Install with: apt install openssl (Ubuntu) or brew install openssl (macOS)"
  exit 1
fi

echo "Generating production secrets..."
echo ""

# Generate secrets
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n/+=')
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '\n/+=')
REDIS_PASSWORD=$(openssl rand -base64 24 | tr -d '\n/+=')
GARAGE_ADMIN_TOKEN=$(openssl rand -base64 32 | tr -d '\n')
GARAGE_RPC_SECRET=$(openssl rand -hex 32)
GARAGE_METRICS_TOKEN=$(openssl rand -base64 32 | tr -d '\n')

if [ "$MODE" = "file" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    echo "Error: File not found: $ENV_FILE"
    echo "Copy .env.production.example first: cp .env.production.example $ENV_FILE"
    exit 1
  fi

  # Replace placeholder values in the env file
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" "$ENV_FILE"
  sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" "$ENV_FILE"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$ENV_FILE"
  sed -i "s|^GARAGE_ADMIN_TOKEN=.*|GARAGE_ADMIN_TOKEN=$GARAGE_ADMIN_TOKEN|" "$ENV_FILE"
  sed -i "s|^GARAGE_RPC_SECRET=.*|GARAGE_RPC_SECRET=$GARAGE_RPC_SECRET|" "$ENV_FILE"
  sed -i "s|^GARAGE_METRICS_TOKEN=.*|GARAGE_METRICS_TOKEN=$GARAGE_METRICS_TOKEN|" "$ENV_FILE"

  echo "Secrets written to: $ENV_FILE"
  echo ""
  echo "IMPORTANT: You still need to set these manually:"
  echo "  - SERVER_DOMAIN or SERVER_IP"
  echo "  - GARAGE_ACCESS_KEY (after running setup-garage.sh)"
  echo "  - GARAGE_SECRET_KEY (after running setup-garage.sh)"
else
  echo "============================================"
  echo "  Generated Secrets (copy to .env.production)"
  echo "============================================"
  echo ""
  echo "DB_PASSWORD=$DB_PASSWORD"
  echo "REDIS_PASSWORD=$REDIS_PASSWORD"
  echo "JWT_SECRET=$JWT_SECRET"
  echo "GARAGE_ADMIN_TOKEN=$GARAGE_ADMIN_TOKEN"
  echo "GARAGE_RPC_SECRET=$GARAGE_RPC_SECRET"
  echo "GARAGE_METRICS_TOKEN=$GARAGE_METRICS_TOKEN"
  echo ""
  echo "============================================"
  echo ""
  echo "To write directly to a file:"
  echo "  $0 --env-file .env.production"
fi
