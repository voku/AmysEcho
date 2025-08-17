#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../server"

# Defaults
export PORT="${PORT:-5000}"
export API_TOKEN="${API_TOKEN:-demo-token}"

echo "=== Amy's Echo Server ==="
echo "PORT=$PORT  API_TOKEN set (${#API_TOKEN} chars)"
# Seed a trained model if missing so /latest-model works in dev
if [ ! -f trained_model.tflite ]; then
  SRC="../app/assets/models/gesture_classifier.tflite"
  if [ -f "$SRC" ]; then
    echo "Seeding trained_model.tflite from $SRC"
    cp "$SRC" ./trained_model.tflite
  else
    echo "Warning: $SRC not found; /latest-model will 404 until a model is trained or placed at server/trained_model.tflite"
  fi
fi
echo "Starting server..."
node dist/server.js
