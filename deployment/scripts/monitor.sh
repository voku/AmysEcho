#!/bin/bash
#
# Amy's Echo Health Monitoring Script
#
# This script checks the health endpoint and logs the result.
# Schedule with cron: */5 * * * * /opt/amysecho/app/deployment/scripts/monitor.sh
#
# Configuration:
# - HEALTH_URL: URL to check (default: http://localhost:5000/health)
# - LOG_FILE: Where to write monitoring logs
# - ALERT_EMAIL: Email to send alerts (optional, requires mail configured)

set -euo pipefail

# Configuration
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
LOG_FILE="${LOG_FILE:-/var/log/amysecho-monitor.log}"
ALERT_EMAIL="${ALERT_EMAIL:-}"
TIMEOUT="${TIMEOUT:-10}"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

# Alert function
send_alert() {
    local message="$1"
    log "ALERT: $message"
    
    # Send email if configured
    if [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null 2>&1; then
        echo "$message" | mail -s "Amy's Echo Server Alert" "$ALERT_EMAIL"
    fi
}

# Check health endpoint
response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$HEALTH_URL" 2>&1) || {
    send_alert "Health check failed - unable to connect to $HEALTH_URL"
    exit 1
}

# Check response code
if [ "$response" = "200" ]; then
    log "OK - Server is healthy (HTTP $response)"
    
    # Optional: Get detailed health info
    health_data=$(curl -s --max-time "$TIMEOUT" "$HEALTH_URL" 2>&1) || true
    if [ -n "$health_data" ]; then
        log "Health data: $health_data"
    fi
else
    send_alert "Health check failed - HTTP $response from $HEALTH_URL"
    exit 1
fi

exit 0
