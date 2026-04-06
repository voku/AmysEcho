# APR-P0-1 — Worker-offload benchmark decision

## Kanban Status
- **Column:** Blocked
- **Owner:** Unassigned
- **Last updated:** 2026-04-06
- **Status authority:** `docs/planning/todo.md`

## Amy impact
- Ensures Amy gets the most stable and responsive detection pipeline on real devices.

## Scope
- Benchmark worker-offload path and record keep/iterate/reject decision.

## Entry points
- `webapp/src/gesture/workers/DetectionWorker.ts`
- `webapp/src/gesture/workers/WorkerDetectionBridge.ts`
- `docs/testing/benchmarks/worker-offload-2026-03-25.md`

## Evidence required for Done
- Updated benchmark report with device matrix and final recommendation.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "worker-offload|WorkerDetectionBridge" webapp/src docs/testing/benchmarks`

## Progress notes (2026-04-06)
- Added canonical APR result evaluation tooling in `scripts/evaluate_device_protocol_results.py` so sustained-session/device-cycle artefacts can be converted into `summary.md` and `apr-p0-4-gate-interpretation.md` without ad-hoc spreadsheet work.
- Remaining blocker: this topic still requires real-device main-thread vs worker-mode measurements from the APR-P0-2 cycle; the current workspace does not contain those caregiver-device artefacts.
