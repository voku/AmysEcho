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
  if [ ! -d "$pkg_dir" ]; then
    echo "Error: Directory $pkg_dir does not exist" >&2
    return 1
  fi
  if [ "${CI:-}" = "true" ]; then
    npm ci --prefix "$pkg_dir" --legacy-peer-deps || npm install --prefix "$pkg_dir" --legacy-peer-deps
  else
    npm install --prefix "$pkg_dir" --legacy-peer-deps
  fi
}

run_step "Install webapp dependencies" install_node_modules webapp
run_step "Install server dependencies" install_node_modules server
run_step "Install integration dependencies" install_node_modules integration

# Ensure dummy MediaPipe assets exist for integration tests
mkdir -p server/data/models server/data/dgs_video_examples
dd if=/dev/zero of=server/data/models/hand_landmarker.task bs=1M count=2 2>/dev/null
dd if=/dev/zero of=server/data/models/pose_landmarker.task bs=1M count=2 2>/dev/null
dd if=/dev/zero of=server/data/models/face_landmarker.task bs=1M count=2 2>/dev/null
# Verify dummy models were created
for model in hand_landmarker.task pose_landmarker.task face_landmarker.task; do
  if [ ! -s "server/data/models/$model" ]; then
    echo "Error: Failed to create $model" >&2
    exit 1
  fi
done
labels=('alle' 'blau' 'essen' 'fertig' 'gelb' 'gruen' 'nochmal' 'rot' 'satt' 'schwester' 'spielen' 'trinken')
for label in "${labels[@]}"; do
  touch "server/data/dgs_video_examples/${label}.mp4"
  touch "server/data/dgs_video_examples/${label}_main_${label}.mp4"
  touch "server/data/dgs_video_examples/${label}_var_${label}_0.mp4"
  echo '{"frames": []}' > "server/data/dgs_video_examples/${label}_landmarks.json"
done
# Create test manifest with videos array format and stats section
# This format matches what the labelRegistry tests expect
echo '{
  "version": "3.0",
  "description": "Test fixture for DGS video examples",
  "gestures": [
    {"id": "alle", "label": "alle", "videos": ["alle.mp4", "alle_main_alle.mp4", "alle_var_alle_0.mp4"], "totalVideoCount": 3},
    {"id": "blau", "label": "blau", "videos": ["blau.mp4", "blau_main_blau.mp4", "blau_var_blau_0.mp4"], "totalVideoCount": 3},
    {"id": "essen", "label": "essen", "videos": ["essen.mp4", "essen_main_essen.mp4", "essen_var_essen_0.mp4"], "totalVideoCount": 3},
    {"id": "fertig", "label": "fertig", "videos": ["fertig.mp4", "fertig_main_fertig.mp4", "fertig_var_fertig_0.mp4"], "totalVideoCount": 3},
    {"id": "gelb", "label": "gelb", "videos": ["gelb.mp4", "gelb_main_gelb.mp4", "gelb_var_gelb_0.mp4"], "totalVideoCount": 3},
    {"id": "gruen", "label": "gruen", "videos": ["gruen.mp4", "gruen_main_gruen.mp4", "gruen_var_gruen_0.mp4"], "totalVideoCount": 3},
    {"id": "nochmal", "label": "nochmal", "videos": ["nochmal.mp4", "nochmal_main_nochmal.mp4", "nochmal_var_nochmal_0.mp4"], "totalVideoCount": 3},
    {"id": "rot", "label": "rot", "videos": ["rot.mp4", "rot_main_rot.mp4", "rot_var_rot_0.mp4"], "totalVideoCount": 3},
    {"id": "satt", "label": "satt", "videos": ["satt.mp4", "satt_main_satt.mp4", "satt_var_satt_0.mp4"], "totalVideoCount": 3},
    {"id": "schwester", "label": "schwester", "videos": ["schwester.mp4", "schwester_main_schwester.mp4", "schwester_var_schwester_0.mp4"], "totalVideoCount": 3},
    {"id": "spielen", "label": "spielen", "videos": ["spielen.mp4", "spielen_main_spielen.mp4", "spielen_var_spielen_0.mp4"], "totalVideoCount": 3},
    {"id": "trinken", "label": "trinken", "videos": ["trinken.mp4", "trinken_main_trinken.mp4", "trinken_var_trinken_0.mp4"], "totalVideoCount": 3}
  ],
  "stats": {
    "totalLabels": 12,
    "totalVideos": 36
  }
}' > server/data/dgs_manifest.json

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

# Run Python static analysis
run_step "Lint Python" ruff check .
run_step "Type-check Python (server)" mypy server/
run_step "Type-check Python (scripts)" sh -c 'cd scripts && mypy .'

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
