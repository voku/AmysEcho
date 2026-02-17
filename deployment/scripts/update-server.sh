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
# - CHECK_UPLOAD_ROUTE: true | false (default: true)
# - UPLOAD_ROUTE_URL: URL for upload route verification (default: http://localhost:5000/api/v1/dgs/sample-bundles)
# - CHECK_PROXY_CONFIG: true | false (default: true)
# - NGINX_CONFIG_PATH: nginx vhost config path used for proxy verification (default: /etc/nginx/sites-enabled/amysecho)
# - PUBLIC_BASE_URL: Optional HTTPS base URL (e.g. https://amysecho.example.org) to validate reverse proxy routing
# - STRICT_PROXY_RECOMMENDATIONS: true | false (default: false) fail update when recommended proxy settings are missing
# - SUDO: sudo command override (default: sudo)

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/amysecho/app}"
SERVICE_NAME="${SERVICE_NAME:-amysecho}"
REPO_USER="${REPO_USER:-amysecho}"
RUN_TESTS="${RUN_TESTS:-false}"
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/health}"
CHECK_HEALTH="${CHECK_HEALTH:-true}"
CHECK_UPLOAD_ROUTE="${CHECK_UPLOAD_ROUTE:-true}"
UPLOAD_ROUTE_URL="${UPLOAD_ROUTE_URL:-http://localhost:5000/api/v1/dgs/sample-bundles}"
CHECK_PROXY_CONFIG="${CHECK_PROXY_CONFIG:-true}"
NGINX_CONFIG_PATH="${NGINX_CONFIG_PATH:-/etc/nginx/sites-enabled/amysecho}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"
STRICT_PROXY_RECOMMENDATIONS="${STRICT_PROXY_RECOMMENDATIONS:-false}"
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

warn() {
    log "WARNUNG: $1"
}

run_systemctl() {
    if [ -n "$SUDO" ]; then
        $SUDO systemctl "$@"
    else
        systemctl "$@"
    fi
}

probe_upload_route() {
    local url="$1"
    local context="$2"
    local status

    status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 \
        -X POST \
        -H "x-api-token: demo-token" \
        -F "bundle=@/etc/hosts;type=application/zip" \
        "$url" || true)

    if [ "$status" = "000" ]; then
        error_exit "$context nicht erreichbar: $url"
    fi

    if [ "$status" = "404" ]; then
        error_exit "$context meldet HTTP 404 für $url. Prüfe nginx/ISPConfig-Proxy und Webapp-API-URL."
    fi

    if [ "$status" = "405" ]; then
        error_exit "$context meldet HTTP 405 für $url. Wahrscheinlich blockiert der Webserver POST auf /api/v1/dgs/sample-bundles."
    fi

    log "$context erreichbar (HTTP $status): $url"
}

verify_proxy_config() {
    local config_path="$1"

    if [ ! -f "$config_path" ]; then
        warn "nginx-Konfiguration nicht gefunden: $config_path"
        return
    fi

    if ! rg -q "proxy_pass\s+http://(127\.0\.0\.1|localhost):5000" "$config_path"; then
        error_exit "In $config_path wurde kein proxy_pass auf localhost:5000 gefunden. Bitte Reverse-Proxy prüfen."
    fi

    if ! rg -q "location\s+/" "$config_path"; then
        error_exit "In $config_path fehlt ein location / Block. API-Routen werden vermutlich nicht weitergeleitet."
    fi

    if rg -n "listen[^;]*proxy_protocol|real_ip_header\s+proxy_protocol" "$config_path" >/dev/null; then
        error_exit "In $config_path ist PROXY Protocol aktiv. Bitte in ISPConfig 'Enable PROXY Protocol' deaktivieren."
    fi

    local missing=()

    if ! rg -q "client_max_body_size\s+([1-9][0-9]*[mM]|[1-9][0-9]*[gG])" "$config_path"; then
        missing+=("client_max_body_size (z. B. 256m)")
    fi

    if ! rg -q "proxy_request_buffering\s+off" "$config_path"; then
        missing+=("proxy_request_buffering off")
    fi

    if ! rg -q "proxy_read_timeout\s+(3[0-9]{2}|[4-9][0-9]{2,})s" "$config_path"; then
        missing+=("proxy_read_timeout >= 300s")
    fi

    if ! rg -q "proxy_connect_timeout\s+(3[0-9]{2}|[4-9][0-9]{2,})s" "$config_path"; then
        missing+=("proxy_connect_timeout >= 300s")
    fi

    if ! rg -q "Access-Control-Allow-Methods.*PUT.*DELETE|Access-Control-Allow-Methods.*DELETE.*PUT" "$config_path"; then
        missing+=("CORS-Methoden inkl. PUT/DELETE")
    fi

    if ! rg -q "if \(\$request_method = OPTIONS\)" "$config_path" || ! rg -q "return 204;" "$config_path"; then
        missing+=("OPTIONS-Handler mit return 204")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        local message="Empfohlene Proxy-Einstellungen fehlen in $config_path: ${missing[*]}"
        if [ "$STRICT_PROXY_RECOMMENDATIONS" = "true" ]; then
            error_exit "$message"
        fi
        warn "$message"
    fi

    log "nginx-Proxy-Konfiguration geprüft: $config_path"
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

if [ "$CHECK_PROXY_CONFIG" = "true" ]; then
    log "nginx/Reverse-Proxy-Konfiguration wird geprüft"
    verify_proxy_config "$NGINX_CONFIG_PATH"
fi

if [ "$CHECK_UPLOAD_ROUTE" = "true" ]; then
    log "Upload-Route wird lokal geprüft: $UPLOAD_ROUTE_URL"
    probe_upload_route "$UPLOAD_ROUTE_URL" "Lokale Upload-Route"

    if [ -n "$PUBLIC_BASE_URL" ]; then
        PUBLIC_UPLOAD_URL="${PUBLIC_BASE_URL%/}/api/v1/dgs/sample-bundles"
        log "Upload-Route wird öffentlich geprüft: $PUBLIC_UPLOAD_URL"
        probe_upload_route "$PUBLIC_UPLOAD_URL" "Öffentliche Upload-Route"
    else
        log "Hinweis: PUBLIC_BASE_URL nicht gesetzt, öffentlicher Reverse-Proxy-Test wird übersprungen"
    fi
fi

log "=== Update erfolgreich abgeschlossen ==="

exit 0
