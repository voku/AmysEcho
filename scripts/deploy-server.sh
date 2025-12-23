#!/bin/bash
# Server Deployment Script for Amy's Echo (Non-Docker / Systemd)
# Path: /var/www/amysecho.moelleken.org/home/voku_amysecho/AmysEcho/scripts/deploy-server.sh

set -e

# --- Configuration ---
APP_ROOT="/var/www/amysecho.moelleken.org/home/voku_amysecho/AmysEcho"
SERVER_DIR="$APP_ROOT/server"
SERVICE_NAME="amysecho"
SERVICE_USER="web7"
SERVICE_GROUP="client1"

echo "🚀 Starting Deployment for Amy's Echo Server..."

# 1. Update Source
echo "📥 Pulling latest code from git..."
cd "$APP_ROOT"
# Ensure we are on the right branch and clean
git pull

# 2. Build Server
echo "🛠️  Building Server API..."
cd "$SERVER_DIR"

# Clean previous build artifacts
rm -rf dist/

# Install dependencies and build
npm ci
npm run build

# 3. Permissions Management
# Ensure the runtime user (web7) can access the new files and write to data
echo "👤 Restoring ownership to $SERVICE_USER:$SERVICE_GROUP..."
chown -R $SERVICE_USER:$SERVICE_GROUP "$APP_ROOT"

# Ensure data directories exist and are writable
# (These paths match your systemd ReadWritePaths)
mkdir -p "$SERVER_DIR/data"
chown $SERVICE_USER:$SERVICE_GROUP "$SERVER_DIR/data" "$SERVER_DIR/db.json" || true
chmod 775 "$SERVER_DIR/data" || true

# 4. Restart Systemd Service
echo "🔄 Restarting systemd service: $SERVICE_NAME..."
sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE_NAME"

# 5. Verification
echo "📡 Verifying health endpoints..."
sleep 3

echo -n "Checking /health: "
curl -s -f https://amysecho.moelleken.org/health > /dev/null && echo "✅ OK" || echo "❌ Failed"

echo -n "Checking /api/v1/health: "
curl -s -f https://amysecho.moelleken.org/api/v1/health > /dev/null && echo "✅ OK" || echo "❌ Failed"

echo -e "\n✨ Deployment successfully completed!"
