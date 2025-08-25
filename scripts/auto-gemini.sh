#!/usr/bin/env bash
set -euo pipefail

# Auto-run Gemini in a loop. After each run, read the summary and craft a
# targeted follow-up prompt for the next run. Stop with Ctrl-C.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOGDIR="$ROOT_DIR/logs/gemini"
mkdir -p "$LOGDIR"

ITER=0
BACKOFF=2
MAX_BACKOFF=1800 # 30 minutes
MODEL_FILE="$LOGDIR/model.current"
# Prefer pro by default; fallback to flash if needed
DEFAULT_MODEL="gemini-2.5-pro"
FALLBACK_MODEL="gemini-2.5-flash"
[ -f "$MODEL_FILE" ] || echo "$DEFAULT_MODEL" > "$MODEL_FILE"
while true; do
  ITER=$((ITER+1))
  echo "[auto-gemini] Iteration #$ITER starting..."

  APPEND_FILE=""
  # If there is a latest summary, create a follow-up prompt based on unresolved items
  LAST_SUMMARY=$(ls -1t "$LOGDIR"/summary-*.md 2>/dev/null | head -n1 || true)
  if [ -n "$LAST_SUMMARY" ]; then
    APPEND_FILE="/tmp/gemini_append_$ITER.txt"
    echo "[auto-gemini] Building follow-up prompt from $LAST_SUMMARY" >&2
    {
      echo "Focus on unresolved items from the previous summary."
      echo "If TypeScript errors persist in app/src/components/MediaPipeGestureDetector.tsx, resolve them to pass 'npm run type-check --prefix app' while preserving functionality."
      echo "Guidance:"
      echo "- Prefer type-safe guards and explicit any casts only at boundaries (e.g., WebView event)."
      echo "- Consider moving large HTML template to a helper string to avoid TS parser confusion."
      echo "- Add minimal declarations in app/src/declarations.d.ts for any missing globals (e.g., window.vision)."
      echo "- After changes, run: npm run type-check --prefix app && npm test --prefix app."
      echo "- Update the new SUMMARY_PATH with exact changes and any remaining issues."
      echo
      echo "Context (truncated previous summary):"
      head -c 2000 "$LAST_SUMMARY"
    } > "$APPEND_FILE"
  fi

  CURRENT_MODEL=$(cat "$MODEL_FILE" 2>/dev/null || echo "$DEFAULT_MODEL")
  if [ -n "$APPEND_FILE" ]; then
    RUN_GEMINI_MODEL="$CURRENT_MODEL" RUN_GEMINI_APPEND_FILE="$APPEND_FILE" bash "$ROOT_DIR/scripts/run-gemini.sh"
  else
    RUN_GEMINI_MODEL="$CURRENT_MODEL" bash "$ROOT_DIR/scripts/run-gemini.sh"
  fi

  # Wait for this iteration's summary
  if bash "$ROOT_DIR/scripts/watch-gemini.sh" 120; then
    SUMMARY=$(ls -1t "$LOGDIR"/summary-*.md | head -n1)
    echo "[auto-gemini] Completed iteration #$ITER. Summary: $SUMMARY"
    BACKOFF=2
    # On success, reset to preferred model for next iteration
    echo "$DEFAULT_MODEL" > "$MODEL_FILE"
  else
    echo "[auto-gemini] Gemini exited without writing a summary. See latest log in $LOGDIR" >&2
    # Detect quota/429 and apply backoff to avoid hammering.
    LAST_RUN_LOG=$(ls -1t "$LOGDIR"/run-*.log 2>/dev/null | head -n1 || true)
    if [ -n "$LAST_RUN_LOG" ] && rg -q "(RESOURCE_EXHAUSTED|\b429\b|quota exceeded)" "$LAST_RUN_LOG"; then
      echo "[auto-gemini] Detected API quota exhaustion (429/RESOURCE_EXHAUSTED). Backing off for $BACKOFF seconds." >&2
      # Switch to fallback free model for next iteration
      echo "$FALLBACK_MODEL" > "$MODEL_FILE"
      sleep "$BACKOFF"
      BACKOFF=$(( BACKOFF * 2 ))
      if [ "$BACKOFF" -gt "$MAX_BACKOFF" ]; then BACKOFF=$MAX_BACKOFF; fi
      continue
    fi
    # If we see a model/endpoint error, try fallback model once
    if [ -n "$LAST_RUN_LOG" ] && rg -q "(Unknown model|invalid model|unavailable)" "$LAST_RUN_LOG"; then
      echo "[auto-gemini] Model error detected; switching to fallback once." >&2
      echo "$FALLBACK_MODEL" > "$MODEL_FILE"
      sleep 2
      continue
    fi
  fi

  # Small pause before next iteration to avoid hot loop
  sleep 2
done
