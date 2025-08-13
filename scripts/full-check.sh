#!/bin/bash
set -euo pipefail

# Ensure Node dependencies are installed
# Clear npm proxy settings to avoid warnings in CI
unset npm_config_http_proxy
unset npm_config_https_proxy

install_node_modules() {
  local pkg_dir="$1"
  if [ "${CI:-}" = "true" ]; then
    npm ci --prefix "$pkg_dir" || npm install --prefix "$pkg_dir"
  else
    npm install --prefix "$pkg_dir"
  fi
}

install_node_modules app
install_node_modules server
install_node_modules integration

# Verify Expo setup for the mobile app
(cd app && npx expo install --check) || echo "expo install check failed" >&2
(cd app && npx expo-doctor) || echo "expo doctor reported issues" >&2

# Run type check and tests for the React Native app
npm run type-check --prefix app
npm test --prefix app

# Install backend Python deps (if needed)
PIP_FLAGS=""
if [ "$(id -u)" -eq 0 ] && [ -z "${VIRTUAL_ENV:-}" ]; then
  PIP_FLAGS="--break-system-packages"
fi
pip install ${PIP_FLAGS} -r server/requirements.txt

# Run type check and run server tests
npm run type-check --prefix server
npm test --prefix server
npm test --prefix integration

# Export dependency snapshots for reproducibility diagnostics
if [ -f scripts/deps-snapshot.sh ]; then
  bash scripts/deps-snapshot.sh || true
fi

# Enforce pinned critical dependencies for deterministic builds
if [ -f scripts/check-pins.js ]; then
  node scripts/check-pins.js || exit 1
fi
