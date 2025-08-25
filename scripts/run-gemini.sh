#!/usr/bin/env bash
set -euo pipefail

# Run Gemini non-interactively with full logs captured to files to avoid TUI truncation.
# Usage: scripts/run-gemini.sh [additional-gemini-args]

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOGDIR="$ROOT_DIR/logs/gemini"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$LOGDIR/run-$TS.log"
SUMMARY="$LOGDIR/summary-$TS.md"
TELE="$LOGDIR/telemetry-$TS.jsonl"
mkdir -p "$LOGDIR"

PROMPT_FILE="/tmp/gemini_prompt_$$.txt"
cat > "$PROMPT_FILE" << 'EOF'
You are an engineering agent working in the Amy's Echo repo.
Follow this exact workflow:
1) Read AGENTS.md, spec/AmysEcho.md, and docs/TODO.md.
2) Prioritize items in docs/TODO.md marked Now/P0, focusing on small, surgical changes.
3) Implement code changes directly in the repo. Keep changes minimal and consistent with existing style. Do not add unrelated fixes.
4) After changes, run the checks listed in AGENTS.md under "Run Tests and Type Checks". If something fails, make the smallest changes needed to fix only directly-related issues.
5) At the end, write a concise summary of what you changed and why to the following file path (create it if it does not exist): SUMMARY_PATH
6) Avoid interactive UI; prefer plain logs.
Constraints:
- Do not commit; just modify files.
- Prefer direct edits over broad refactors.
- If a task is ambiguous, leave a TODO comment and proceed.
EOF
sed -i "s|SUMMARY_PATH|$SUMMARY|g" "$PROMPT_FILE"

# Optionally append follow-up instructions from previous iteration
if [ -n "${RUN_GEMINI_APPEND_FILE:-}" ] && [ -f "$RUN_GEMINI_APPEND_FILE" ]; then
  echo -e "\n\n# Follow-up Instructions\n" >> "$PROMPT_FILE"
  cat "$RUN_GEMINI_APPEND_FILE" >> "$PROMPT_FILE"
fi

MODEL_DEFAULT=${RUN_GEMINI_MODEL:-gemini-pro}
echo "[run-gemini] Launching Gemini...\n  model: $MODEL_DEFAULT\n  log: $OUT\n  telemetry: $TELE\n  summary: $SUMMARY"

# Force non-TTY behavior and disable colors for readable logs.
# Increase Node heap to reduce OOM risk on large workspaces.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

# Limit included directories to reduce memory footprint.
INCLUDE_ARGS=(
  --include-directories app \
  --include-directories server \
  --include-directories docs \
  --include-directories spec \
  --include-directories scripts
)

CI=1 NO_COLOR=1 gemini --approval-mode yolo --debug \
  -m "$MODEL_DEFAULT" \
  -p "$(cat "$PROMPT_FILE")" \
  "${INCLUDE_ARGS[@]}" \
  --telemetry-outfile "$TELE" \
  "$@" > "$OUT" 2>&1 &

PID=$!
echo "$PID" > "$LOGDIR/last_pid"
echo "[run-gemini] Started gemini (PID $PID). Tail logs with: tail -f $OUT"

trap 'rm -f "$PROMPT_FILE"' EXIT
