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

# Ensure MediaPipe assets exist for integration tests
# Only create dummy files if valid models don't already exist
mkdir -p server/data/models server/data/dgs_video_examples
for model in hand_landmarker.task pose_landmarker.task face_landmarker.task; do
  model_path="server/data/models/$model"
  if [ -s "$model_path" ]; then
    # MediaPipe .task files start with 2 null bytes followed by ZIP signature "PK" (0x504b)
    header=$(head -c 4 "$model_path" | od -An -tx1 | tr -d ' ')
    if [ "$header" = "0000504b" ]; then
      echo "Valid MediaPipe model found: $model"
      continue
    fi
  fi
  # Create dummy file for testing (model not found or invalid)
  echo "Creating dummy MediaPipe model: $model"
  dd if=/dev/zero of="$model_path" bs=1M count=2 2>/dev/null
done
# Verify models exist (either real or dummy)
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
# Dynamically generated from labels array for maintainability
{
  gestures_json=""
  for label in "${labels[@]}"; do
    video_base="${label}.mp4"
    video_main="${label}_main_${label}.mp4"
    video_var="${label}_var_${label}_0.mp4"
    gestures_json+=$(printf '{"id":"%s","label":"%s","videos":["%s","%s","%s"],"totalVideoCount":3},' \
      "$label" "$label" "$video_base" "$video_main" "$video_var")
  done
  # Remove trailing comma
  gestures_json="${gestures_json%,}"
  num_labels=${#labels[@]}
  total_videos=$((num_labels * 3))
  cat <<EOF
{
  "version": "3.0",
  "description": "Test fixture for DGS video examples",
  "gestures": [$gestures_json],
  "stats": {
    "totalLabels": $num_labels,
    "totalVideos": $total_videos
  }
}
EOF
} > server/data/dgs_manifest.json

# Run lint/type-check/tests for the browser webapp
run_step "Lint webapp" npm run lint --prefix webapp
run_step "Type-check webapp" npm run type-check --prefix webapp
if [ "${SKIP_WEBAPP_TEST:-false}" = "true" ]; then
  echo "Skipping webapp tests because SKIP_WEBAPP_TEST=true"
else
  run_step "Test webapp" npm test --prefix webapp
fi
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
if [ "${INTEGRATION_TEST_PROFILE:-full}" = "fast" ]; then
  run_step "Test integration package (fast profile)" npm run test:fast --prefix integration
else
  run_step "Test integration package" npm test --prefix integration
fi

# Export dependency snapshots for reproducibility diagnostics
if [ -f scripts/deps-snapshot.sh ]; then
  run_step "Export dependency snapshots" bash scripts/deps-snapshot.sh || true
fi

# Enforce pinned critical dependencies for deterministic builds
if [ -f scripts/check-pins.js ]; then
  run_step "Verify pinned dependencies" node scripts/check-pins.js
fi

# Terminology quality gate: ensure user-facing copy uses "Gebärde"
if [ -f scripts/check-terminology.sh ]; then
  run_step "Check terminology" bash scripts/check-terminology.sh
fi

# API documentation gate: route inventory must match docs index
if [ -f scripts/check-api-doc-routes.mjs ]; then
  run_step "Check API docs route coverage" node scripts/check-api-doc-routes.mjs
fi
