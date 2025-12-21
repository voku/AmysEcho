#!/bin/bash
#
# Amy's Echo Server Update Script
#
# Usage (systemd):
#   sudo /opt/amysecho/app/deployment/scripts/update-server.sh
#
# Optional environment variables:
# - REPO_DIR: Repository root (default: /opt/amysecho/app)
# - SERVICE_NAME: systemd service name (default: amysecho)
# - REPO_USER: User that owns repository files (default: amysecho)
# - RUN_TESTS: true | false (default: false)
# - HEALTH_URL: URL to verify health after update (default: http://localhost:5000/health)
# - CHECK_HEALTH: true | false (default: true)
# - SUDO: sudo command override (default: sudo)

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/amysecho/app}"
SERVICE_NAME="${SERVICE_NAME:-amysecho}"
REPO_USER="${REPO_USER:-amysecho}"
RUN_TESTS="${RUN_TESTS:-false}"
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
CHECK_HEALTH="${CHECK_HEALTH:-true}"
SUDO="${SUDO:-sudo}"
LOG_FILE="${LOG_FILE:-/var/log/amysecho-update.log}"

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

CURRENT_COMMIT=$(sudo -u "$REPO_USER" git rev-parse --short HEAD)
log "Aktueller Commit: $CURRENT_COMMIT"

log "Neueste Änderungen werden abgerufen..."
sudo -u "$REPO_USER" git fetch --all --prune

sudo -u "$REPO_USER" git pull --ff-only || error_exit "Git-Pull fehlgeschlagen"

UPDATED_COMMIT=$(sudo -u "$REPO_USER" git rev-parse --short HEAD)

# Skip unnecessary work if no updates were pulled
if [ "$CURRENT_COMMIT" = "$UPDATED_COMMIT" ]; then
    log "Bereits auf dem neuesten Stand. Keine weiteren Aktionen erforderlich."
    log "=== Update-Skript beendet (keine Änderungen) ==="
    exit 0
fi

log "Aktualisierter Commit: $UPDATED_COMMIT"

log "Server-Abhängigkeiten werden installiert..."
sudo -u "$REPO_USER" npm ci --prefix server

log "Python-Abhängigkeiten werden installiert..."
if [ -d "server/.venv" ]; then
    log "Virtuelle Python-Umgebung wird verwendet."
    sudo -u "$REPO_USER" bash -c "source server/.venv/bin/activate && pip install -r server/requirements.txt"
else
    log "WARNUNG: Keine virtuelle Python-Umgebung gefunden in server/.venv"
    sudo -u "$REPO_USER" pip install -r server/requirements.txt
fi

if [ "$RUN_TESTS" = "true" ]; then
    log "Server-Type-Check wird ausgeführt..."
    sudo -u "$REPO_USER" npm run type-check --prefix server

    log "Server-Tests werden ausgeführt..."
    sudo -u "$REPO_USER" npm test --prefix server
fi

log "Server wird gebaut..."
sudo -u "$REPO_USER" npm run build --prefix server

log "Systemd-Dienst wird neu gestartet: $SERVICE_NAME"
run_systemctl restart "$SERVICE_NAME"

# Brief delay to allow service to initialize
sleep 2

if [ "$CHECK_HEALTH" = "true" ]; then
    log "Health-Endpoint wird geprüft: $HEALTH_URL"
    if ! curl -sSf --max-time 15 "$HEALTH_URL" >/dev/null; then
        error_exit "Health-Check fehlgeschlagen für $HEALTH_URL"
    fi
    log "Health-Check erfolgreich"
fi

log "=== Update erfolgreich abgeschlossen ==="

exit 0
