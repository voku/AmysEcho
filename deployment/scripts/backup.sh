#!/bin/bash
#
# Amy's Echo Automated Backup Script
#
# This script creates a compressed backup of the server data and database.
# Schedule with cron: 0 2 * * * /opt/amysecho/app/deployment/scripts/backup.sh
#
# Configuration:
# - Adjust BACKUP_DIR to your preferred backup location
# - Adjust RETENTION_DAYS to control how long backups are kept
# - Uncomment service stop/start if you need consistent snapshots

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/amysecho}"
APP_DIR="${APP_DIR:-/opt/amysecho/app/server}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/amysecho_backup_$TIMESTAMP.tar.gz"
LOG_FILE="${LOG_FILE:-/var/log/amysecho-backup.log}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Error handler
error_exit() {
    log "ERROR: $1"
    exit 1
}

log "=== Starting Amy's Echo backup ==="

# Create backup directory
mkdir -p "$BACKUP_DIR" || error_exit "Failed to create backup directory"

# Check if application directory exists
if [ ! -d "$APP_DIR" ]; then
    error_exit "Application directory not found: $APP_DIR"
fi

# Optional: Stop service for consistent backup
# Uncomment if you need consistent snapshots
# log "Stopping amysecho service..."
# sudo systemctl stop amysecho || error_exit "Failed to stop service"

# Create backup
log "Creating backup: $BACKUP_FILE"
tar -czf "$BACKUP_FILE" \
    -C "$APP_DIR" \
    data/ \
    db.json \
    2>&1 | tee -a "$LOG_FILE" || error_exit "Backup creation failed"

# Optional: Restart service
# Uncomment if you stopped it above
# log "Restarting amysecho service..."
# sudo systemctl start amysecho || error_exit "Failed to restart service"

# Verify backup was created
if [ ! -f "$BACKUP_FILE" ]; then
    error_exit "Backup file was not created"
fi

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup created successfully: $BACKUP_FILE ($BACKUP_SIZE)"

# Clean up old backups
log "Cleaning up backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "amysecho_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
log "Deleted $DELETED old backup(s)"

# List current backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "amysecho_backup_*.tar.gz" | wc -l)
log "Current backups: $BACKUP_COUNT"

log "=== Backup completed successfully ==="

exit 0
