#!/bin/bash
# ===========================================
# Garage Initial Setup Script
# Run this after starting docker-compose
# ===========================================

set -e

echo "========================================="
echo "Garage Storage Service - Initial Setup"
echo "========================================="

# Wait for Garage to be ready
echo "Waiting for Garage to start..."
sleep 10

# Check if Garage is healthy
until docker exec garage-storage curl -sf http://localhost:3903/health > /dev/null 2>&1; do
    echo "Waiting for Garage health check..."
    sleep 5
done

echo "Garage is healthy!"

# Get node ID
echo ""
echo "Getting node ID..."
NODE_ID=$(docker exec garage-storage /garage node id 2>/dev/null | head -n 1 | tr -d '\r\n' | cut -d'@' -f1)

if [ -z "$NODE_ID" ]; then
    echo "Error: Could not get node ID"
    exit 1
fi

echo "Node ID: $NODE_ID"

# Check current layout status
LAYOUT_STATUS=$(docker exec garage-storage /garage layout show 2>/dev/null || echo "")

if echo "$LAYOUT_STATUS" | grep -q "No nodes"; then
    # Assign layout
    echo ""
    echo "Assigning layout..."
    docker exec garage-storage /garage layout assign -z dc1 -c 100G "$NODE_ID"

    # Apply layout
    echo "Applying layout..."
    docker exec garage-storage /garage layout apply --version 1
    echo "Layout applied successfully!"
else
    echo "Layout already configured, skipping..."
fi

# Create main bucket for the service
echo ""
echo "Creating storage-service bucket..."
docker exec garage-storage /garage bucket create storage-service 2>/dev/null || echo "Bucket may already exist"

# Check if API key already exists
EXISTING_KEYS=$(docker exec garage-storage /garage key list 2>/dev/null || echo "")

if echo "$EXISTING_KEYS" | grep -q "storage-api-key"; then
    echo "API key 'storage-api-key' already exists"
    echo "Use 'docker exec garage-storage /garage key info storage-api-key' to see credentials"
else
    # Create API key
    echo ""
    echo "Creating API key..."
    KEY_OUTPUT=$(docker exec garage-storage /garage key create storage-api-key 2>&1)

    echo "$KEY_OUTPUT"

    # Extract credentials
    ACCESS_KEY=$(echo "$KEY_OUTPUT" | grep "Key ID:" | awk '{print $NF}')
    SECRET_KEY=$(echo "$KEY_OUTPUT" | grep "Secret key:" | awk '{print $NF}')

    # Grant permissions
    echo ""
    echo "Granting bucket permissions..."
    docker exec garage-storage /garage bucket allow \
        --read --write --owner \
        storage-service \
        --key storage-api-key

    echo ""
    echo "========================================="
    echo "Garage Setup Complete!"
    echo "========================================="
    echo ""
    echo "Add these to your .env file:"
    echo "GARAGE_ACCESS_KEY=$ACCESS_KEY"
    echo "GARAGE_SECRET_KEY=$SECRET_KEY"
    echo ""
fi

echo "Bucket permissions granted!"
echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Update .env with the Garage credentials shown above"
echo "2. Restart the storage-api service: docker-compose restart storage-api"
echo ""
