#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="docs/deps"
mkdir -p "$OUT_DIR"

echo "Generating dependency snapshots..."

# App (React Native)
if [ -f app/package.json ]; then
  npm ls --prefix app --all --json --silent --legacy-peer-deps > "$OUT_DIR/app-deps.json" || true
fi

# Server (Node)
if [ -f server/package.json ]; then
  npm ls --prefix server --all --json --silent --legacy-peer-deps > "$OUT_DIR/server-deps.json" || true
fi

# Integration workspace
if [ -f integration/package.json ]; then
  npm ls --prefix integration --all --json --silent --legacy-peer-deps > "$OUT_DIR/integration-deps.json" || true
fi

echo "Dependency snapshots written to $OUT_DIR" 

