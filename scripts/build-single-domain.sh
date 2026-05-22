#!/usr/bin/env bash
set -euo pipefail

unset npm_config_http_proxy
unset npm_config_https_proxy

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVER_PUBLIC_DIR="${REPO_ROOT}/server/public"
WEBAPP_DIST_DIR="${REPO_ROOT}/webapp/dist"
COMMIT_SHA="$(git -C "${REPO_ROOT}" --no-pager rev-parse --short HEAD)"

echo "Preparing Amy's Echo single-domain bundle"
echo "Commit SHA: ${COMMIT_SHA}"

echo "Installing webapp dependencies"
npm ci --prefix "${REPO_ROOT}/webapp"

echo "Type-checking webapp"
npm run type-check --prefix "${REPO_ROOT}/webapp"

echo "Building webapp for same-domain production"
VITE_APP_COMMIT_SHA="${COMMIT_SHA}" \
VITE_BASE_PATH="/" \
npm run build --prefix "${REPO_ROOT}/webapp"

echo "Installing server dependencies"
npm ci --prefix "${REPO_ROOT}/server"

echo "Type-checking server"
npm run type-check --prefix "${REPO_ROOT}/server"

echo "Building server"
npm run build --prefix "${REPO_ROOT}/server"

echo "Copying webapp bundle into ${SERVER_PUBLIC_DIR}"
rm -rf "${SERVER_PUBLIC_DIR}"
mkdir -p "${SERVER_PUBLIC_DIR}"
cp -R "${WEBAPP_DIST_DIR}/." "${SERVER_PUBLIC_DIR}/"

echo "Single-domain bundle ready"
echo "  Webapp: ${SERVER_PUBLIC_DIR}/index.html"
echo "  Server: ${REPO_ROOT}/server/dist/server.js"
echo "  Commit SHA baked into webapp: ${COMMIT_SHA}"
