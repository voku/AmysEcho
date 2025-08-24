#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../server"

# Defaults
export PORT="${PORT:-5000}"
export API_TOKEN="${API_TOKEN:-demo-token}"

echo "=== Amy's Echo Server ==="
echo "PORT=$PORT  API_TOKEN set (${#API_TOKEN} chars)"
# Warn if no trained model present
if [ ! -f trained_model.json ]; then
  echo "Warning: server/trained_model.json missing; /latest-model will 404 until a model is trained or placed at server/trained_model.json"
fi
echo "Starting server..."
node dist/server.js
