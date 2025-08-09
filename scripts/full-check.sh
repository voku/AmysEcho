#!/bin/bash
set -e

# Ensure Node dependencies are installed
# Clear npm proxy settings to avoid warnings in CI
unset npm_config_http_proxy
unset npm_config_https_proxy
npm install --prefix app
npm install --prefix server
npm install --prefix integration

# Run type check and tests for the React Native app
npm run type-check --prefix app
npm test --prefix app

# Install backend Python deps (if needed)
pip install -r server/requirements.txt # maybe `--root-user-action=ignore` is needed here

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
