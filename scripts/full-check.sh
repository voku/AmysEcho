#!/bin/bash
set -euo pipefail

run_step() {
  local label="$1"
  shift
  echo "::group::${label}"
  local start
  start=$(date +%s)
  set +e
  "$@"
  local status=$?
  set -e
  local end
  end=$(date +%s)
  local duration=$((end - start))
  if [ "$status" -eq 0 ]; then
    printf '%s completed in %ss\n' "$label" "$duration"
  else
    printf '%s failed in %ss\n' "$label" "$duration" >&2
  fi
  echo "::endgroup::"
  return "$status"
}

# Ensure tests run non-interactively
export CI="${CI:-true}"

# Ensure Node dependencies are installed
# Clear npm proxy settings to avoid warnings in CI
unset npm_config_http_proxy
unset npm_config_https_proxy

install_node_modules() {
  local pkg_dir="$1"
  if [ "${CI:-}" = "true" ]; then
    npm ci --prefix "$pkg_dir" --legacy-peer-deps || npm install --prefix "$pkg_dir" --legacy-peer-deps
  else
    npm install --prefix "$pkg_dir" --legacy-peer-deps
  fi
}

run_step "Install webapp dependencies" install_node_modules webapp
run_step "Install server dependencies" install_node_modules server
run_step "Install integration dependencies" install_node_modules integration

# Run lint/type-check/tests for the browser webapp
run_step "Lint webapp" npm run lint --prefix webapp
run_step "Type-check webapp" npm run type-check --prefix webapp
run_step "Test webapp" npm test --prefix webapp
run_step "Build webapp" npm run build --prefix webapp

# Install backend Python deps (if needed)
PIP_FLAGS=""
if [ "$(id -u)" -eq 0 ] && [ -z "${VIRTUAL_ENV:-}" ]; then
  PIP_FLAGS="--break-system-packages"
fi
run_step "Install Python dependencies" pip install ${PIP_FLAGS} -r server/requirements.txt

# Run type check and run server tests
run_step "Type-check server" npm run type-check --prefix server
run_step "Test server" npm test --prefix server
run_step "Test integration package" npm test --prefix integration

# Export dependency snapshots for reproducibility diagnostics
if [ -f scripts/deps-snapshot.sh ]; then
  run_step "Export dependency snapshots" bash scripts/deps-snapshot.sh || true
fi

# Enforce pinned critical dependencies for deterministic builds
if [ -f scripts/check-pins.js ]; then
  run_step "Verify pinned dependencies" node scripts/check-pins.js
fi
