#!/usr/bin/env bash
set -euo pipefail

# Wait for the active Gemini run to finish or for its summary file to appear.
# Prints status updates and exits with non-zero if the process exits without producing a summary.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOGDIR="$ROOT_DIR/logs/gemini"

if [ ! -f "$LOGDIR/last_pid" ]; then
  echo "No active Gemini run found (missing $LOGDIR/last_pid)" >&2
  exit 2
fi

PID=$(cat "$LOGDIR/last_pid")
LOG=$(ls -1t "$LOGDIR"/run-*.log | head -n1)
SUMMARY_TARGET="${LOG/run-/summary-}"
SUMMARY_TARGET="${SUMMARY_TARGET/.log/.md}"

echo "[watch-gemini] Watching PID $PID"
echo "[watch-gemini] Log: $LOG"
echo "[watch-gemini] Summary (target): $SUMMARY_TARGET"

ATTEMPTS=${1:-120} # default ~10 minutes at 5s intervals
for i in $(seq 1 "$ATTEMPTS"); do
  if [ -f "$SUMMARY_TARGET" ]; then
    echo "[watch-gemini] Summary found: $SUMMARY_TARGET"
    exit 0
  fi
  if ! ps -p "$PID" > /dev/null; then
    echo "[watch-gemini] Process exited without summary. See log: $LOG"
    exit 1
  fi
  sleep 5
done

echo "[watch-gemini] Timeout waiting for summary. Still running."
exit 3

