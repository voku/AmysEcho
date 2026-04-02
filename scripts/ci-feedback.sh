#!/usr/bin/env bash
set -euo pipefail

MODE="quick"
BASE_REF=""
FORCE_ALL="false"
INSTALL_MODE="missing"

usage() {
  cat <<'USAGE'
Usage: ./scripts/ci-feedback.sh [--mode quick|full] [--base <git-ref>] [--all] [--install always|missing]

Runs GitHub-CI-like checks locally with path-aware skipping for a faster feedback loop.

Options:
  --mode quick   Fast local loop (default): lint/type-check/test/build for changed areas,
                 plus the training-readiness gate when relevant.
  --mode full    Adds webapp coverage + npm audit checks to match .github/workflows/ci.yml.
  --base <ref>   Compare changed files against this ref (default: origin/main, then main).
  --all          Ignore changed-file detection and run checks for webapp, server, and integration.
  --install      Dependency install mode:
                 - missing (default): run npm ci only when node_modules is missing
                 - always: run npm ci before every package check
  -h, --help     Show this help.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --base)
      BASE_REF="${2:-}"
      shift 2
      ;;
    --all)
      FORCE_ALL="true"
      shift
      ;;
    --install)
      INSTALL_MODE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ "$MODE" != "quick" ] && [ "$MODE" != "full" ]; then
  echo "Invalid mode: $MODE (expected quick or full)." >&2
  exit 1
fi

if [ "$INSTALL_MODE" != "missing" ] && [ "$INSTALL_MODE" != "always" ]; then
  echo "Invalid --install value: $INSTALL_MODE (expected missing or always)." >&2
  exit 1
fi

run_step() {
  local label="$1"
  shift
  echo "\n▶ $label"
  "$@"
}

resolve_main_base_ref() {
  if [ -n "$BASE_REF" ]; then
    echo "$BASE_REF"
    return
  fi

  if git rev-parse --verify --quiet origin/main >/dev/null; then
    echo "origin/main"
    return
  fi

  if git rev-parse --verify --quiet main >/dev/null; then
    echo "main"
    return
  fi

  echo ""
}

collect_changed_files() {
  local base_ref="$1"

  if [ -n "$base_ref" ]; then
    git diff --name-only "$base_ref"...HEAD
    return
  fi

  git status --porcelain | awk '{print $2}'
}

ensure_node_dependencies() {
  local pkg_dir="$1"

  if [ "$INSTALL_MODE" = "always" ] || [ ! -d "$pkg_dir/node_modules" ]; then
    run_step "Install ${pkg_dir} deps" npm ci --prefix "$pkg_dir"
  else
    echo "⏭ Reusing existing ${pkg_dir}/node_modules (install mode: missing)."
  fi
}

needs_training_gate_for_file() {
  local file="$1"
  case "$file" in
    .github/workflows/ci.yml|server/test/test_training_pipeline_fixture.py|server/test/fixtures/training_integration_fixture.json|server/src/routes/latestMlpModelRoute.ts|server/src/routes/diagnosticsRoutes.ts|server/src/services/mlpModelArtifacts.ts|server/src/server.ts|server/src/amyserver_tools/train_mlp.py|server/src/amyserver_tools/train_mlp_fewshot.py)
      return 0
      ;;
    server/src/*training*.ts|server/src/*/*training*.ts|server/src/*/*manifest*.ts|server/src/routes/training*.ts|server/src/services/training*.ts|server/src/services/*manifest*.ts)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

BASE="$(resolve_main_base_ref)"
CHANGED_FILES=""

if [ "$FORCE_ALL" = "false" ]; then
  CHANGED_FILES="$(collect_changed_files "$BASE")"
  if [ -n "$BASE" ]; then
    echo "Using base ref: $BASE"
  else
    echo "No main branch ref found; using working tree changes (staged + unstaged)."
  fi
else
  echo "Running all checks (--all)."
fi

NEED_WEBAPP="false"
NEED_SERVER="false"
NEED_INTEGRATION="false"
NEED_TRAINING_GATE="false"

if [ "$FORCE_ALL" = "true" ]; then
  NEED_WEBAPP="true"
  NEED_SERVER="true"
  NEED_INTEGRATION="true"
  NEED_TRAINING_GATE="true"
else
  while IFS= read -r file; do
    [ -z "$file" ] && continue

    case "$file" in
      webapp/*)
        NEED_WEBAPP="true"
        ;;
      server/*)
        NEED_SERVER="true"
        ;;
      integration/*)
        NEED_INTEGRATION="true"
        ;;
      scripts/full-check.sh|scripts/check-terminology.sh)
        NEED_WEBAPP="true"
        NEED_SERVER="true"
        NEED_INTEGRATION="true"
        ;;
      .github/workflows/ci.yml)
        NEED_WEBAPP="true"
        NEED_SERVER="true"
        NEED_INTEGRATION="true"
        ;;
    esac

    if needs_training_gate_for_file "$file"; then
      NEED_TRAINING_GATE="true"
    fi
  done <<< "$CHANGED_FILES"
fi

if [ "$NEED_WEBAPP" = "false" ] && [ "$NEED_SERVER" = "false" ] && [ "$NEED_INTEGRATION" = "false" ] && [ "$NEED_TRAINING_GATE" = "false" ]; then
  echo "No CI-relevant changes detected. Nothing to run."
  exit 0
fi

export CI=true

if [ "$NEED_WEBAPP" = "true" ]; then
  ensure_node_dependencies webapp
  run_step "Lint webapp" npm run lint --prefix webapp
  run_step "Type-check webapp" npm run type-check --prefix webapp
  run_step "Test webapp" npm test --prefix webapp
  run_step "Build webapp" npm run build --prefix webapp
  if [ "$MODE" = "full" ]; then
    run_step "Webapp coverage gate" npm --prefix webapp run test:coverage -- --coverage.reporter=text-summary
    run_step "Webapp security audit" npm audit --prefix webapp --audit-level=high
  fi
fi

if [ "$NEED_SERVER" = "true" ]; then
  ensure_node_dependencies server
  run_step "Type-check server" npm run type-check --prefix server
  run_step "Test server" npm test --prefix server
  if [ "$MODE" = "full" ]; then
    run_step "Server security audit" npm audit --prefix server --audit-level=high
  fi
fi

if [ "$NEED_INTEGRATION" = "true" ]; then
  ensure_node_dependencies integration
  if [ "$MODE" = "full" ]; then
    run_step "Test integration (full profile)" npm run test:full --prefix integration
  else
    run_step "Test integration (fast profile)" npm run test:fast --prefix integration
  fi
  if [ "$MODE" = "full" ]; then
    run_step "Integration security audit" npm audit --prefix integration --audit-level=high
  fi
fi

if [ "$NEED_TRAINING_GATE" = "true" ]; then
  run_step "Install Python dependencies for training gate" pip install -r server/requirements.txt
  run_step "Training readiness fixture gate" pytest server/test/test_training_pipeline_fixture.py -q
else
  echo "Skipping training-readiness fixture gate (no relevant server training changes)."
fi

echo "\n✅ Local CI-feedback run completed in '$MODE' mode."
