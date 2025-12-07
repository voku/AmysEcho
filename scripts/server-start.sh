#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../server"

# Defaults
export PORT="${PORT:-5000}"

if [ -z "${JWT_SECRET:-}" ] || [ -z "${JWT_REFRESH_SECRET:-}" ]; then
  echo "JWT_SECRET and JWT_REFRESH_SECRET must be set before starting the server." >&2
  exit 1
fi

echo "=== Amy's Echo Server ==="
echo "PORT=$PORT"
# Warn if no trained model present
if [ ! -f data/models/global/amy_model.npz ]; then
  echo "Warning: server/data/models/global/amy_model.npz missing; /latest-mlp-model will 404 until a model is trained or placed at that path"
fi
echo "Building TypeScript..."
npm run build

echo "Starting server..."
node dist/server.js
