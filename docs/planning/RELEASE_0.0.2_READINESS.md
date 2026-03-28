# Release Readiness: v0.0.2

This checklist is the final gate before creating tag `v0.0.2`.

## Goal

Ship a verified stabilization release with updated quality evidence, documentation alignment, and a clear post-tag roadmap.

## 1) Verification Commands (Run from repo root)

Use this command set before tagging:

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

### Current pre-tag execution evidence (2026-03-24)

- [x] `npm run type-check --prefix webapp`
- [x] `npm run lint --prefix webapp`
- [x] `npm test --prefix webapp`
- [x] `npm run build --prefix webapp`
- [x] `npm run type-check --prefix server`
- [x] `npm run lint --prefix server`
- [x] `npm test --prefix server`
- [x] `npm run build --prefix server`
- [x] `npm test --prefix integration`
- [x] `cd integration && node test-runner.js ci` (full suite: 14/14 passing, ~652s)

Known environment notes:

- npm prints `Unknown env config "http-proxy"` warnings in this environment. Builds/tests still pass.
- `npm test --prefix integration` reports a pre-existing high-severity npm audit finding in integration dependencies; tests still pass and the issue should be tracked as a post-tag security follow-up.
- Integration runner timeout is now configurable through `INTEGRATION_GLOBAL_TIMEOUT_MS`; default is 30 minutes when `CI=true` and 15 minutes locally.

## 2) Coverage & Quality Gates

- Automated quality gate status: **PASS** for webapp, server, and integration suites.
- Integration full-stack CI command (`cd integration && node test-runner.js ci`) completed in a single run with 14/14 passing on 2026-03-24.
- Coverage confidence snapshot is documented in `docs/testing/TEST_COVERAGE_ANALYSIS.md`.
- Critical flow evidence includes:
  - auth/session and refresh rotation tests,
  - profile-scoped model distribution tests,
  - upload→train→download integration tests,
  - health and reliability route tests.

## 3) Documentation Gates

Confirm the following files are current and internally consistent before tag creation:

- `README.md`
- `docs/planning/TODO.md`
- `docs/README.md`
- `docs/testing/TEST_COVERAGE_ANALYSIS.md`
- `AGENTS.md`, `webapp/AGENTS.md`, `server/AGENTS.md`

## 4) Functional Go/No-Go Checklist

- [x] Account login/logout and token refresh verified via automated tests.
- [x] Active profile scope and profile-bound model behavior verified.
- [x] Capture/bundle/upload/train/model-download flow verified.
- [x] Health endpoints and reliability checks verified.
- [x] German user-facing text policy remains documented and enforced in contributor guidance.

## 5) Release Artifacts

Prepare and attach before creating the tag:

- `v0.0.2` release notes (scope, Amy impact, known limitations)
- command evidence summary (pass/fail + warnings)
- known risk register items and owners (security audit warning, operational manual checks)
- production health monitoring ownership + thresholds (`docs/operations/PRODUCTION_HEALTH_MONITORING_OWNERSHIP.md`)
- latest incident drill artifact with rollback evidence (`docs/operations/INCIDENT_DRILL_2026-03-27.md`)

## 6) Immediate Post-v0.0.2 Priorities

1. Resolve/truncate high-severity integration dependency findings and record remediation evidence.
2. Add CI-published line/branch coverage percentages for webapp and server.
3. Execute manual device and accessibility validation cadence and attach results to release notes.
4. Continue stress/performance hardening for long-session caregiver usage.
