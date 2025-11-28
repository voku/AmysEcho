#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="docs/deps"
mkdir -p "$OUT_DIR"

echo "Generating dependency snapshots..."

# Webapp (React + Vite)
if [ -f webapp/package.json ]; then
  npm ls --prefix webapp --all --json --silent --legacy-peer-deps > "$OUT_DIR/webapp-deps.json" || true
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

