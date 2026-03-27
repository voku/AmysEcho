#!/usr/bin/env bash
# scripts/check-terminology.sh — Terminology quality gate for Amy's Echo
#
# Scans user-facing source files for prohibited sign-language terminology.
# The correct German term is "Gebärde" (not "Geste" or "Zeichen" when
# referring to sign language).
#
# Exit 0 = clean, Exit 1 = violations found.
#
# False-positive notes:
#   - Only string literals (text inside quotes) are checked, not variable
#     names or code identifiers. This avoids matching English "gesture" or
#     camelCase identifiers like "gestureDetector".
#   - Test files (*.test.ts, *.test.tsx) and type definitions (*.d.ts) are
#     excluded since they are developer-facing, not user-facing.
#   - If a legitimate use of "Geste" in a string literal is needed (e.g.,
#     quoting an external source), add "# terminology-ok" as a comment on
#     the same line and extend the grep with --invert-match for that marker.
#
# Reference: docs/guides/TERMINOLOGY_COMPATIBILITY_CHECKLIST.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Directories to scan (user-facing source, not tests or types)
SCAN_PATHS=(
  "$REPO_ROOT/webapp/src/components"
  "$REPO_ROOT/webapp/src/context"
  "$REPO_ROOT/webapp/src/hooks"
  "$REPO_ROOT/webapp/src/services"
  "$REPO_ROOT/server/src/routes"
)

# File extensions to check
EXTENSIONS="tsx,ts"

# Prohibited patterns in user-facing strings.
# We look for German words that are wrong for sign language context:
#   "Geste"/"Gesten" — colloquial for physical gesture, not sign language
# We exclude:
#   - Test files (*.test.ts, *.test.tsx)
#   - Type definition files (*.d.ts)
#   - English code identifiers (gesture, Gesture — these are code-level, not user-facing)
#
# Strategy: grep for quoted strings containing the prohibited terms.
# This targets user-facing text (string literals) not variable names.

PROHIBITED_PATTERNS=(
  # German strings containing "Geste" or "Gesten" as user-visible text
  # Match inside quote-delimited strings to focus on user-facing copy
  '"[^"]*\bGeste\b[^"]*"'
  '"[^"]*\bGesten\b[^"]*"'
  "'[^']*\bGeste\b[^']*'"
  "'[^']*\bGesten\b[^']*'"
  '`[^`]*\bGeste\b[^`]*`'
  '`[^`]*\bGesten\b[^`]*`'
)

violations=0

for dir in "${SCAN_PATHS[@]}"; do
  if [ ! -d "$dir" ]; then
    continue
  fi

  for pattern in "${PROHIBITED_PATTERNS[@]}"; do
    # Use grep; exclude test files and type definitions.
    # Lines containing "// terminology-ok" are intentional exceptions.
    matches=$(grep -rn --include="*.ts" --include="*.tsx" \
      --exclude="*.test.ts" --exclude="*.test.tsx" --exclude="*.d.ts" \
      -E "$pattern" "$dir" 2>/dev/null | grep -vE '//.*terminology-ok' || true)

    if [ -n "$matches" ]; then
      echo "❌ Prohibited terminology found:"
      echo "$matches"
      echo ""
      violations=$((violations + 1))
    fi
  done
done

if [ "$violations" -gt 0 ]; then
  echo "============================================"
  echo "TERMINOLOGY CHECK FAILED"
  echo ""
  echo "Found $violations violation(s) of the sign-language"
  echo "terminology standard."
  echo ""
  echo 'User-facing term must be "Gebärde" (not "Geste" or "Gesten").'
  echo "See: docs/guides/TERMINOLOGY_COMPATIBILITY_CHECKLIST.md"
  echo "============================================"
  exit 1
fi

echo "✅ Terminology check passed — no prohibited terms in user-facing strings."
exit 0
