#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../server"

# Defaults
export PORT="${PORT:-5000}"
export API_TOKEN="${API_TOKEN:-demo-token}"

echo "=== Amy's Echo Server ==="
echo "PORT=$PORT  API_TOKEN set (${#API_TOKEN} chars)"
# Warn if no trained model present
if [ ! -f data/models/global/amy_model.npz ]; then
  echo "Warning: server/data/models/global/amy_model.npz missing; /latest-mlp-model will 404 until a model is trained or placed at that path"
fi
echo "Building TypeScript..."
npm run build

echo "Starting server..."
node dist/server.js
