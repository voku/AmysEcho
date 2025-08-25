#!/bin/bash
#
# Amy's Echo - Automated Gemini Agent Runner
#
# This script runs the Gemini CLI in a continuous loop, analyzing the output of each
# run to generate a focused follow-up prompt for the next iteration. It is designed
# to guide the AI towards resolving specific goals, like fixing TypeScript errors,
# by automatically continuing the context from one run to the next.
#

set -e # Exit immediately if a command exits with a non-zero status.

# --- Configuration ---
LOG_DIR="logs/gemini"
PROMPT_FILE="docs/TODO.md" # The initial, high-level goal for Gemini.
MAX_RETRIES=10 # Maximum number of auto-retries before stopping.

# --- Initialization ---
mkdir -p "$LOG_DIR"
# A file to hold the prompt that gets passed to the next iteration.
FOLLOW_UP_PROMPT_FILE="$LOG_DIR/follow_up.prompt"
# The main log for the entire auto-agent session.
AUTO_LOG_FILE="$LOG_DIR/agent-run-$(date +%Y%m%d-%H%M%S).log"

# Tee stdout and stderr to the main agent log file.
exec > >(tee -a "$AUTO_LOG_FILE") 2>&1

echo "--- Starting Auto-Agent ---"
echo "Full log for this session: $(pwd)/$AUTO_LOG_FILE"
echo "Initial prompt file: $PROMPT_FILE"
echo "---------------------------"

# --- Main Loop ---
for ((i=1; i<=MAX_RETRIES; i++)); do
    RUN_LOG="$LOG_DIR/run-$i.log"
    SUMMARY_LOG="$LOG_DIR/run-$i.summary.log"

    echo
    echo "--- Starting Run $i of $MAX_RETRIES ---"
    echo "Run Log: $RUN_LOG"

    # Prepare the full prompt for this run.
    # It starts with the main goal and adds the follow-up prompt if it exists.
    FULL_PROMPT_FILE="$LOG_DIR/full_prompt_for_run_$i.txt"
    cat "$PROMPT_FILE" > "$FULL_PROMPT_FILE"
    if [ -f "$FOLLOW_UP_PROMPT_FILE" ]; then
        echo "" >> "$FULL_PROMPT_FILE"
        echo "---" >> "$FULL_PROMPT_FILE"
        echo "Please continue the previous task. Here is the context from the last run:" >> "$FULL_PROMPT_FILE"
        cat "$FOLLOW_UP_PROMPT_FILE" >> "$FULL_PROMPT_FILE"
    fi

    # Run Gemini in the background
    # We use --approval-mode yolo for unattended execution.
    npm run gemini:v2 -- --prompt-file "$FULL_PROMPT_FILE" --approval-mode yolo > "$RUN_LOG" 2>&1 &
    GEMINI_PID=$!
    echo "Gemini process started with PID: $GEMINI_PID"
    echo "$GEMINI_PID" > "$LOG_DIR/last_pid"

    # Wait for the Gemini process to complete. This is more efficient than polling.
    wait "$GEMINI_PID"
    EXIT_CODE=$?
    echo "Gemini process $GEMINI_PID finished with exit code: $EXIT_CODE"

    # --- Analyze Run and Prepare Next Prompt ---

    # Extract the summary for easy review.
    sed -n '/SUMMARY:/,$p' "$RUN_LOG" > "$SUMMARY_LOG"

    # Check for success or failure to generate the next prompt.
    # We look for common error patterns in the log.
    if grep -q -E "TypeScript error|compilation failed|Error:|failed to" "$RUN_LOG"; then
        echo "Run $i finished with errors. Generating a follow-up prompt to fix them."
        # Create a targeted prompt focusing on the errors.
        {
            echo "The previous run failed with errors. Please analyze the following log and fix the issues."
            echo "Focus on any TypeScript, build, or runtime errors."
            echo ""
            echo "Full log from the failed run is attached below:"
            echo "--- LOG START ---"
            cat "$RUN_LOG"
            echo "--- LOG END ---"
        } > "$FOLLOW_UP_PROMPT_FILE"
    else
        echo "Run $i completed without obvious errors. Continuing task based on summary."
        # Create a generic continuation prompt.
        {
            echo "The previous run completed. Please continue the main task based on the following summary."
            echo ""
            echo "--- SUMMARY START ---"
            cat "$SUMMARY_LOG"
            echo "--- SUMMARY END ---"
        } > "$FOLLOW_UP_PROMPT_FILE"
    fi

    echo "--- Finished Run $i ---"
    # Add a small delay to avoid overwhelming systems or hitting rate limits.
    sleep 3
done

echo
echo "--- Auto-Agent Finished ---"
echo "Reached max retries ($MAX_RETRIES). Stopping."
