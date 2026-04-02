# APR-P0-1 — Worker-offload benchmark decision

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-02

## Amy impact
- Ensures Amy gets the most stable and responsive detection pipeline on real devices.

## Scope
- Benchmark worker-offload path and record keep/iterate/reject decision.

## Entry points
- `webapp/src/gesture/workers/DetectionWorker.ts`
- `webapp/src/gesture/workers/WorkerDetectionBridge.ts`
- `docs/testing/benchmarks/worker_offload_2026-03-25.md`

## Evidence required for Done
- Updated benchmark report with device matrix and final recommendation.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "worker-offload|WorkerDetectionBridge" webapp/src docs/testing/benchmarks`
