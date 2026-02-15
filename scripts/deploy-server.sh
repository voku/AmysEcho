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
chown $SERVICE_USER:$SERVICE_GROUP "$SERVER_DIR/data" || true
# SQLite files handling
for f in "$SERVER_DIR/db.json" "$SERVER_DIR/db.sqlite" "$SERVER_DIR/db.sqlite-wal" "$SERVER_DIR/db.sqlite-shm"; do
    if [ -f "$f" ]; then
        chown $SERVICE_USER:$SERVICE_GROUP "$f"
        chmod 664 "$f"
    fi
done
chmod 775 "$SERVER_DIR/data" || true

# 4. Restart Systemd Service
echo "🔄 Restarting systemd service: $SERVICE_NAME..."
sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE_NAME"

# 5. Verification
echo "📡 Verifying health endpoints..."
# Give it a bit more time and check locally first
sleep 5

echo "Checking local health (bypassing Nginx):"
curl -s -f http://127.0.0.1:5000/health > /dev/null && echo "  127.0.0.1:5000/health: ✅ OK" || echo "  127.0.0.1:5000/health: ❌ Failed"

echo "Checking public health (via Nginx):"
echo -n "  Checking /health: "
curl -s -f https://amysecho.moelleken.org/health > /dev/null && echo "✅ OK" || echo "❌ Failed"

echo -n "  Checking /api/v1/health: "
curl -s -f https://amysecho.moelleken.org/api/v1/health > /dev/null && echo "✅ OK" || echo "❌ Failed"

echo -n "  Checking /api/v1/dgs/sample-bundles route: "
BUNDLE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://amysecho.moelleken.org/api/v1/dgs/sample-bundles)
if [ "$BUNDLE_STATUS" = "404" ]; then
    echo "❌ Missing (HTTP 404)"
elif [ "$BUNDLE_STATUS" = "000" ]; then
    echo "❌ Unreachable"
else
    echo "✅ Reachable (HTTP $BUNDLE_STATUS)"
fi

# If it failed, show the logs and diagnostic info
if ! curl -s -f http://127.0.0.1:5000/health > /dev/null || [ "${BUNDLE_STATUS:-000}" = "404" ]; then
    echo -e "\n⚠️  Health check failed! Diagnostics:"
    echo "1. Last 20 lines of service logs:"
    sudo journalctl -u "$SERVICE_NAME" -n 20 --no-pager
    
    echo -e "\n2. Service Status:"
    sudo systemctl status "$SERVICE_NAME" --no-pager
    
    echo -e "\n3. Permission Check:"
    ls -la "$SERVER_DIR/db.sqlite"* 2>/dev/null || echo "   db.sqlite not found"
    
    echo -e "\n💡 Tip: Check if /etc/systemd/system/$SERVICE_NAME.service has:"
    echo "   User=$SERVICE_USER"
    echo "   Group=$SERVICE_GROUP"
    echo "   ReadWritePaths=$SERVER_DIR/data $SERVER_DIR/"
fi

echo -e "\n✨ Deployment successfully completed!"
