#!/bin/bash
# SKH Storage - SSL Certificate Setup
# Usage: ./scripts/ssl-setup.sh [self-signed|letsencrypt]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SSL_DIR="$SCRIPT_DIR/../nginx/ssl"
mkdir -p "$SSL_DIR"

MODE="${1:-self-signed}"

# Load .env.production if it exists
ENV_FILE="$SCRIPT_DIR/../.env.production"
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

DOMAIN="${SERVER_DOMAIN:-localhost}"
IP="${SERVER_IP:-127.0.0.1}"

case "$MODE" in
  self-signed)
    echo "=========================================="
    echo "Generating self-signed SSL certificate"
    echo "=========================================="
    echo "Domain: $DOMAIN"
    echo "IP: $IP"
    echo ""

    openssl req -x509 -nodes -days 365 \
      -newkey rsa:2048 \
      -keyout "$SSL_DIR/privkey.pem" \
      -out "$SSL_DIR/fullchain.pem" \
      -subj "/C=TH/ST=Bangkok/L=Bangkok/O=SKH Storage/CN=$DOMAIN" \
      -addext "subjectAltName=DNS:$DOMAIN,DNS:s3.$DOMAIN,DNS:localhost,IP:$IP,IP:127.0.0.1"

    echo ""
    echo "Self-signed certificate generated:"
    echo "  Certificate: $SSL_DIR/fullchain.pem"
    echo "  Private Key: $SSL_DIR/privkey.pem"
    echo ""
    echo "NOTE: Browsers will show security warnings with self-signed certificates."
    echo "For production, use Let's Encrypt: $0 letsencrypt"
    ;;

  letsencrypt)
    echo "=========================================="
    echo "Let's Encrypt SSL Certificate Setup"
    echo "=========================================="
    echo ""
    echo "Prerequisites:"
    echo "  - Domain '$DOMAIN' must point to this server's IP"
    echo "  - Port 80 must be accessible from the internet"
    echo "  - certbot must be installed"
    echo ""

    if ! command -v certbot &> /dev/null; then
      echo "Installing certbot..."
      echo ""
      echo "Ubuntu/Debian:"
      echo "  sudo apt update && sudo apt install -y certbot"
      echo ""
      echo "CentOS/RHEL:"
      echo "  sudo yum install -y certbot"
      echo ""
      echo "After installing certbot, run this script again."
      exit 1
    fi

    echo "Requesting certificate for: $DOMAIN"
    echo ""

    # Stop nginx temporarily if running (certbot needs port 80)
    docker stop skh-nginx 2>/dev/null || true

    certbot certonly --standalone \
      -d "$DOMAIN" \
      --non-interactive \
      --agree-tos \
      --email "${SMTP_FROM:-admin@$DOMAIN}"

    # Copy certificates
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/"
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/"

    echo ""
    echo "Let's Encrypt certificate installed:"
    echo "  Certificate: $SSL_DIR/fullchain.pem"
    echo "  Private Key: $SSL_DIR/privkey.pem"
    echo ""
    echo "Auto-renewal setup:"
    echo "  Add to crontab (crontab -e):"
    echo "  0 3 * * * certbot renew --post-hook 'cp /etc/letsencrypt/live/$DOMAIN/*.pem $SSL_DIR/ && docker restart skh-nginx'"
    echo ""

    # Restart nginx
    docker start skh-nginx 2>/dev/null || true
    ;;

  *)
    echo "Usage: $0 [self-signed|letsencrypt]"
    echo ""
    echo "Options:"
    echo "  self-signed   Generate self-signed certificate (default)"
    echo "  letsencrypt   Set up Let's Encrypt certificate"
    exit 1
    ;;
esac
