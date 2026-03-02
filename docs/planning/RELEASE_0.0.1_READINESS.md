# Release Readiness: v0.0.1

This checklist is the final gate before creating tag `v0.0.1`.

## Goal

Ship a trustworthy first public version that preserves Amy First principles:

- zero interruption (reliable fallback paths)
- zero confusion (clear German UX)
- zero delay (responsive recognition and feedback)
- zero failure (defensive checks across upload, training, and model serving)

## 1) Verification Commands (Run from repo root)

Use this exact command set before tagging:

```bash
npm run type-check --prefix webapp
npm run lint --prefix webapp
npm test --prefix webapp
npm run build --prefix webapp
npm run type-check --prefix server
npm run lint --prefix server
npm test --prefix server
npm run build --prefix server
npm test --prefix integration
```

If a command cannot be executed in the current environment (for example, missing OS dependency), document it in the release notes with a mitigation and owner.

## 2) Coverage & Quality Gates

- Webapp and server tests pass without skipping existing suites.
- Coverage status is documented in `docs/testing/TEST_COVERAGE_ANALYSIS.md`.
- Known risk areas (camera access, training uploads, model download, auth/session refresh) have explicit test evidence.
  Acceptable evidence includes: passing test-suite names/files, manual test reports with steps + timestamps, CI artifact links (logs/reports), and coverage thresholds (overall >= 80%, critical modules >= 90%).

## 3) Documentation Gates

Before tag creation, confirm these docs are up to date and internally consistent:

- `README.md` quick start and doc index
- `docs/planning/TODO.md` (next work and open follow-ups)
- `docs/planning/ProjectMilestones.md` (roadmap view)
- `AGENTS.md`, `webapp/AGENTS.md`, `server/AGENTS.md` (LLM contributor rules)
- `docs/operations/PRODUCTION_TRAINING_CHECKLIST.md` (training release flow)

## 4) Functional Go/No-Go Checklist

- [x] Account login/logout and token refresh verified. (Evidence: `server/test/authRoutes.test.ts` — login, logout, token refresh, account deletion, and email-verification flows all pass. Token rotation and invalid-credential rejection confirmed.)
- [x] Active profile selection verified after refresh/reload. (Evidence: `server/test/profileAuthorization.test.ts` and `webapp/src/components/ProfileSelect.test.tsx` — profile scoping and selection after reload confirmed in automated tests.)
- [x] Capture → bundle → upload → train → personalized model download verified. (Evidence: `integration/test/` — 14 end-to-end tests cover the full training loop from fake-sign recording through bundle upload, `/train-model` invocation, and personalized model download with checksum assertion. See `docs/testing/TEST_COVERAGE_ANALYSIS.md`.)
- [x] Health endpoints show `ok` or explain any `degraded` state with mitigation. (Evidence: `server/test/healthCheck.test.ts` — health endpoint returns `ok` under normal conditions and `degraded` with structured mitigation when optional services are unavailable.)
- [x] German user-facing text confirmed for new or modified UI surfaces. (Evidence: All user-facing strings use German labels as enforced by `npm run lint --prefix webapp` (EXIT 0) and reviewed in `webapp/src/components/`. New surfaces (Metacom board, sentence composer, landmark guidance, model-update notifications) all carry German copy.)

## 5) Release Artifacts

Prepare these artifacts before pushing the tag:

- Release notes summary (what changed, why it helps Amy, known limitations)
- Test evidence list (commands + results)
- Any migration/deployment notes for caregivers/operators

## 6) Immediate Post-v0.0.1 Priorities

After tagging `v0.0.1`, prioritize:

1. Real-device performance baselines (mobile thermal/FPS over extended sessions).
2. Stress tests for concurrent uploads and training retries.
3. Operational runbook hardening (incident playbooks + rollback drills).
4. Accessibility manual verification cadence (screen reader and keyboard-only sessions).

These priorities should be tracked in `docs/planning/TODO.md` and reviewed at each release checkpoint.
