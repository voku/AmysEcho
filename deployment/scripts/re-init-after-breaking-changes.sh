#!/bin/bash
#
# Amy's Echo Server Re-initialization Script for Breaking Changes
#
# This script handles re-initialization after breaking changes that require
# data migration or configuration updates.
#
# Usage (systemd):
#   sudo /opt/amysecho/app/deployment/scripts/re-init-after-breaking-changes.sh
#
# Optional environment variables:
# - REPO_DIR: Repository root (default: /opt/amysecho/app)
# - SERVICE_NAME: systemd service name (default: amysecho)
# - DATA_DIR: Data directory (default: /opt/amysecho/data)
# - BACKUP_BEFORE_REINIT: true | false (default: true)

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/amysecho/app}"
SERVICE_NAME="${SERVICE_NAME:-amysecho}"
DATA_DIR="${DATA_DIR:-/opt/amysecho/data}"
BACKUP_BEFORE_REINIT="${BACKUP_BEFORE_REINIT:-true}"
LOG_FILE="${LOG_FILE:-/var/log/amysecho-reinit.log}"

# Ensure script runs with elevated privileges
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Dieses Skript muss mit sudo ausgeführt werden."
    exit 1
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error_exit() {
    log "ERROR: $1"
    exit 1
}

log "=== Amy's Echo Server Re-Initialization (Breaking Changes) ==="
log "Repository: $REPO_DIR"
log "Data Directory: $DATA_DIR"
log "Service: $SERVICE_NAME"

# Stop the service
log "Stopping service: $SERVICE_NAME"
systemctl stop "$SERVICE_NAME" || log "WARNING: Service could not be stopped (may not be running)"

# Create backup if requested
if [ "$BACKUP_BEFORE_REINIT" = "true" ]; then
    BACKUP_DIR="/var/backups/amysecho"
    BACKUP_FILE="$BACKUP_DIR/pre-reinit-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    log "Creating backup before re-initialization..."
    mkdir -p "$BACKUP_DIR"
    
    if [ -d "$DATA_DIR" ]; then
        tar -czf "$BACKUP_FILE" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")" 2>/dev/null || \
            log "WARNING: Backup creation failed or data directory is empty"
        
        if [ -f "$BACKUP_FILE" ]; then
            log "Backup created: $BACKUP_FILE"
        fi
    else
        log "No data directory found at $DATA_DIR, skipping backup"
    fi
fi

# Breaking Change #1: API routes versioned to /api/v1
log "Applying Breaking Change: API routes now use /api/v1 prefix"
log "  - /latest-mlp-model -> /api/v1/models/latest"
log "  - /model-version -> /api/v1/models/version"
log "  - /model-metadata -> /api/v1/models/metadata"
log "  - /api/config/normalization -> /api/v1/config/normalization"

# Breaking Change #2: Profile authorization model changed
log "Applying Breaking Change: Profile authorization now database-backed"
log "  - Removed support for X-Profile-Id header-based auth"
log "  - All profile access now requires user ownership or caregiver relationship"

# Breaking Change #3: Window globals removed
log "Applying Breaking Change: Window globals for configuration removed"
log "  - Removed: __facingMode, __requestClipAudio, __fallbackThreshold"
log "  - Configuration now uses localStorage only"

# Breaking Change #4: Profile migration and auto-creation removed
log "Applying Breaking Change: Profile migration removed"
log "  - No automatic default profile creation"
log "  - Profiles must be created via user registration"

# Check if database needs re-initialization
DB_FILE="$DATA_DIR/db.json"
if [ -f "$DB_FILE" ]; then
    log "Database file found: $DB_FILE"
    log "NOTE: Database will be loaded with new schema requirements"
    log "  - Profiles without users will no longer have usage stats seeded"
    log "  - No automatic userId migration"
else
    log "No existing database found, will be created on first start"
fi

# Update dependencies and rebuild
log "Installing dependencies and rebuilding..."
cd "$REPO_DIR"

log "Installing server dependencies..."
npm ci --prefix server

log "Installing Python dependencies..."
if [ -d "server/.venv" ]; then
    log "Using Python virtual environment"
    sudo -u amysecho bash -c "source server/.venv/bin/activate && pip install -r server/requirements.txt"
else
    log "WARNING: No Python virtual environment found"
    pip install -r server/requirements.txt
fi

log "Building server..."
npm run build --prefix server

log "Installing webapp dependencies..."
npm ci --prefix webapp

log "Building webapp..."
npm run build --prefix webapp

# Start the service
log "Starting service: $SERVICE_NAME"
systemctl start "$SERVICE_NAME"

# Wait for service to initialize
sleep 3

# Health check
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
log "Checking health endpoint: $HEALTH_URL"
MAX_RETRIES=10
RETRY=0

while [ $RETRY -lt $MAX_RETRIES ]; do
    if curl -sSf --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
        log "Health check successful"
        break
    fi
    RETRY=$((RETRY + 1))
    if [ $RETRY -lt $MAX_RETRIES ]; then
        log "Health check failed, retrying ($RETRY/$MAX_RETRIES)..."
        sleep 2
    else
        error_exit "Health check failed after $MAX_RETRIES attempts"
    fi
done

log "=== Re-initialization completed successfully ==="
log ""
log "BREAKING CHANGES APPLIED:"
log "1. API routes now versioned: /api/v1/models/latest (was /latest-mlp-model)"
log "2. Profile authorization database-backed (no X-Profile-Id header)"
log "3. Window globals removed (__facingMode, __fallbackThreshold, etc.)"
log "4. Profile auto-creation and migration removed"
log ""
log "ACTION REQUIRED:"
log "- Update webapp API configuration to use new endpoints"
log "- Ensure all users register before creating profiles"
log "- Use localStorage for camera/gesture configuration"
log ""
log "For rollback, restore from backup: $BACKUP_FILE"

exit 0
