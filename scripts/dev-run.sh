#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../app"

# Defaults (can be overridden by environment)
export EXPO_PUBLIC_NORMALIZE_LANDMARKS="${EXPO_PUBLIC_NORMALIZE_LANDMARKS:-true}"
export EXPO_PUBLIC_NORMALIZE_ALIGN_ROTATION="${EXPO_PUBLIC_NORMALIZE_ALIGN_ROTATION:-true}"
export EXPO_PUBLIC_ENABLE_REMOTE_CLASSIFICATION="${EXPO_PUBLIC_ENABLE_REMOTE_CLASSIFICATION:-false}"
export EXPO_PUBLIC_REMOTE_TIMEOUT_MS="${EXPO_PUBLIC_REMOTE_TIMEOUT_MS:-400}"

echo "=== Amy's Echo Dev Client Start ==="
echo "Normalize: $EXPO_PUBLIC_NORMALIZE_LANDMARKS (align rotation: $EXPO_PUBLIC_NORMALIZE_ALIGN_ROTATION)"
echo "Remote classification: $EXPO_PUBLIC_ENABLE_REMOTE_CLASSIFICATION (timeout: $EXPO_PUBLIC_REMOTE_TIMEOUT_MS ms)"
echo "(Tip) Use --host tunnel if LAN discovery fails."
echo

npx expo start --dev-client "$@"

