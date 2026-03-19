#!/bin/bash
#
# Amy's Echo Training Data Reset Script
#
# Usage:
#   sudo /opt/amysecho/app/deployment/scripts/reset-training-data.sh
#
# Optional environment variables:
# - REPO_DIR: Repository root (default: /opt/amysecho/app)
# - SERVICE_NAME: systemd service name (default: amysecho)
# - REPO_USER: Repository owner for npm/node commands (default: amysecho)
# - DATA_DIR: Training data directory (default: /opt/amysecho/app/server/data)
# - DB_PATH: Database JSON path used to derive db.sqlite (default: /opt/amysecho/app/server/db.json)
# - BACKUP_BEFORE_RESET: true | false (default: true)
# - PRESERVE_GLOBAL_MODEL: true | false (default: true)
# - DRY_RUN: true | false (default: false)
# - AUTO_CONFIRM: true | false (default: false)
# - RESTART_SERVICE: true | false (default: true)
# - CHECK_HEALTH: true | false (default: true)
# - HEALTH_URL: URL to verify health after restart (default: http://localhost:5000/health)
# - SUDO: sudo command override (default: sudo)

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/amysecho/app}"
SERVICE_NAME="${SERVICE_NAME:-amysecho}"
REPO_USER="${REPO_USER:-amysecho}"
DATA_DIR="${DATA_DIR:-$REPO_DIR/server/data}"
DB_PATH="${DB_PATH:-$REPO_DIR/server/db.json}"
BACKUP_BEFORE_RESET="${BACKUP_BEFORE_RESET:-true}"
PRESERVE_GLOBAL_MODEL="${PRESERVE_GLOBAL_MODEL:-true}"
DRY_RUN="${DRY_RUN:-false}"
AUTO_CONFIRM="${AUTO_CONFIRM:-false}"
RESTART_SERVICE="${RESTART_SERVICE:-true}"
CHECK_HEALTH="${CHECK_HEALTH:-true}"
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
SUDO="${SUDO:-sudo}"
LOG_FILE="${LOG_FILE:-/var/log/amysecho-training-reset.log}"

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

to_bool() {
    case "${1,,}" in
        true|1|yes|y) return 0 ;;
        false|0|no|n) return 1 ;;
        *) return 1 ;;
    esac
}

log "=== Amy's Echo Training-Reset gestartet ==="
log "Repository: $REPO_DIR"
log "Data Directory: $DATA_DIR"
log "DB Path: $DB_PATH"
log "Globales Modell behalten: $PRESERVE_GLOBAL_MODEL"
log "Dry Run: $DRY_RUN"

if ! to_bool "$AUTO_CONFIRM"; then
    echo
    echo "WARNUNG: Dieses Skript löscht Trainingsdaten, Uploads, per-User-Trainingsartefakte,"
    echo "         per-Profil-Modelle sowie Trainingsmarkierungen in der Datenbank."
    echo "         Profile, Nutzerkonten und Custom-Sign-Registrierungen bleiben erhalten."
    echo
    read -r -p "Fortfahren? [y/N] " answer
    case "${answer:-}" in
        y|Y|yes|YES) ;;
        *) error_exit "Abgebrochen durch Benutzer." ;;
    esac
fi

if to_bool "$BACKUP_BEFORE_RESET" && ! to_bool "$DRY_RUN"; then
    log "Backup wird vor dem Reset ausgeführt..."
    APP_DIR="$REPO_DIR/server" \
    DATA_DIR="$DATA_DIR" \
    DB_DIR="$(dirname "$DB_PATH")" \
    "$REPO_DIR/deployment/scripts/backup.sh"
fi

if to_bool "$RESTART_SERVICE"; then
    log "Dienst wird gestoppt: $SERVICE_NAME"
    run_systemctl stop "$SERVICE_NAME" || log "WARNUNG: Dienst konnte nicht gestoppt werden"
fi

log "Server wird gebaut, damit das Reset-Tool aktuell ist..."
cd "$REPO_DIR"
$SUDO -u "$REPO_USER" npm run build --prefix server

TOOL_ARGS=(--db-path "$DB_PATH" --json)
if ! to_bool "$PRESERVE_GLOBAL_MODEL"; then
    TOOL_ARGS+=(--drop-global-model)
fi
if to_bool "$DRY_RUN"; then
    TOOL_ARGS+=(--dry-run)
fi

log "Reset-Tool wird ausgeführt..."
RESET_JSON=$(
    cd "$REPO_DIR/server" && \
    AMY_ECHO_DATA_DIR="$DATA_DIR" \
    $SUDO -u "$REPO_USER" node dist/tools/resetTrainingData.js "${TOOL_ARGS[@]}"
)
log "Reset-Zusammenfassung: $RESET_JSON"

if to_bool "$RESTART_SERVICE"; then
    log "Dienst wird gestartet: $SERVICE_NAME"
    run_systemctl start "$SERVICE_NAME"
    sleep 2
fi

if to_bool "$RESTART_SERVICE" && to_bool "$CHECK_HEALTH" && ! to_bool "$DRY_RUN"; then
    log "Health-Endpoint wird geprüft: $HEALTH_URL"
    if ! curl -sSf --max-time 15 "$HEALTH_URL" >/dev/null; then
        error_exit "Health-Check fehlgeschlagen für $HEALTH_URL"
    fi
    log "Health-Check erfolgreich"
fi

log "=== Training-Reset erfolgreich abgeschlossen ==="
exit 0
