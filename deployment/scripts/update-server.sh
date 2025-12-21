#!/bin/bash
#
# Amy's Echo Server Update Script
#
# Usage (systemd):
#   /opt/amysecho/app/deployment/scripts/update-server.sh
#
# Optional environment variables:
# - REPO_DIR: Repository root (default: /opt/amysecho/app)
# - SERVICE_NAME: systemd service name (default: amysecho)
# - RUN_TESTS: true | false (default: false)
# - HEALTH_URL: URL to verify health after update (default: http://localhost:5000/health)
# - CHECK_HEALTH: true | false (default: true)
# - SUDO: sudo command override (default: sudo)

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/amysecho/app}"
SERVICE_NAME="${SERVICE_NAME:-amysecho}"
RUN_TESTS="${RUN_TESTS:-false}"
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
CHECK_HEALTH="${CHECK_HEALTH:-true}"
SUDO="${SUDO:-sudo}"
LOG_FILE="${LOG_FILE:-/var/log/amysecho-update.log}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error_exit() {
    log "ERROR: $1"
    exit 1
}

run_systemctl() {
    if [ -n "$SUDO" ]; then
        $SUDO systemctl "$@"
    else
        systemctl "$@"
    fi
}

log "=== Amy's Echo Server-Update gestartet ==="

if [ ! -d "$REPO_DIR" ]; then
    error_exit "Repository-Verzeichnis nicht gefunden: $REPO_DIR"
fi

cd "$REPO_DIR"

if [ ! -d ".git" ]; then
    error_exit "Kein .git-Verzeichnis gefunden in $REPO_DIR"
fi

CURRENT_COMMIT=$(git rev-parse --short HEAD)
log "Aktueller Commit: $CURRENT_COMMIT"

log "Neueste Änderungen werden abgerufen..."
git fetch --all --prune

git pull --ff-only || error_exit "Git-Pull fehlgeschlagen"

UPDATED_COMMIT=$(git rev-parse --short HEAD)
log "Aktualisierter Commit: $UPDATED_COMMIT"

log "Server-Abhängigkeiten werden installiert..."
npm ci --prefix server

log "Python-Abhängigkeiten werden installiert..."
pip install -r server/requirements.txt

if [ "$RUN_TESTS" = "true" ]; then
    log "Server-Type-Check wird ausgeführt..."
    npm run type-check --prefix server

    log "Server-Tests werden ausgeführt..."
    npm test --prefix server
fi

log "Server wird gebaut..."
npm run build --prefix server

log "Systemd-Dienst wird neu gestartet: $SERVICE_NAME"
run_systemctl restart "$SERVICE_NAME"

if [ "$CHECK_HEALTH" = "true" ]; then
    log "Health-Endpoint wird geprüft: $HEALTH_URL"
    if ! curl -sSf --max-time 15 "$HEALTH_URL" >/dev/null; then
        error_exit "Health-Check fehlgeschlagen für $HEALTH_URL"
    fi
    log "Health-Check erfolgreich"
fi

log "=== Update erfolgreich abgeschlossen ==="

exit 0
