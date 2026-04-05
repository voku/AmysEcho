# Test Coverage Analysis (v0.0.2 Pre-Tag Snapshot)

This document records the pre-tag verification snapshot for `v0.0.2` and links coverage confidence to Amy-critical workflows.

## 1) Command Snapshot

Executed from repository root on 2026-03-03:

- `npm test --prefix webapp` → **128 test files, 1238 tests passed**
- `npm test --prefix server` → **42 test suites, 272 tests passed (TS) + 113 tests passed (Python)**
- `npm test --prefix integration` → **14 integration tests passed**

## 2) Amy-Critical Coverage Areas

### Webapp

Covered by passing suites in `webapp/src/**`:

- Recognition/runtime safety: detector hooks, orchestrator processing steps, confidence policy, error recovery, fallback clip recorder.
- Training pipeline UX: recorder, upload queue, training validator/job orchestration, training bundle helpers.
- Profile and auth UX boundaries: login, profile bar/manager/select, user settings, app state/status.
- Metacom communication flow: mapping, recommendations, memory, board data, sentence composition surfaces.

### Server

Covered by passing suites in `server/test/**`:

- Auth/session lifecycle: login, refresh rotation, authorization failures, HTTPS enforcement.
- Upload/training/model lifecycle: bundle ingest/upload, model artifacts/versioning/latest routes, profile tuning.
- Data protection/compliance: GDPR endpoints, audit logger, account delete flows.
- Reliability/security: health checks, stress tests, schema/config checksums.

### Integration

Covered by passing suites in `integration/test/**`:

- End-to-end capture/upload/train/download loop.
- Metadata preservation (multimodal + backward compatibility).
- Profile-scoped model distribution and fallback behavior.
- Real HTTP auth flow and model consumption through webapp helpers.

## 3) Gaps and Follow-ups

- This snapshot reports **test execution breadth and pass/fail confidence**, not Istanbul-style line percentage thresholds.
- For the `v0.0.2` cycle, prioritize adding explicit percentage thresholds in CI artifacts for webapp/server and link them here.
- Keep operational/manual evidence (device thermal/FPS, accessibility drills) in release readiness docs because those areas are not fully automated.
