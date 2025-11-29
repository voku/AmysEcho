#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../webapp"

# Defaults (can be overridden by environment)
export VITE_API_URL="${VITE_API_URL:-http://localhost:5000}"

echo "=== Amy's Echo Webapp Dev Server ==="
echo "API: $VITE_API_URL"
echo

npm run dev "$@"
