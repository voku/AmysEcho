# APR-P0-2 — First device performance measurement cycle

## Kanban Status
- **Column:** Blocked
- **Owner:** Unassigned
- **Last updated:** 2026-04-06
- **Status authority:** `docs/planning/todo.md`

## Amy impact
- Prevents regressions that could slow down Amy's communication feedback loop.

## Scope
- Run protocol scenarios and capture reproducible performance artifacts.

## Entry points
- `webapp/src/hooks/useSignLanguageDetector.ts`
- `webapp/src/components/TrainingRecorder.tsx`
- `docs/testing/benchmarks/device-performance-protocol.md`

## Evidence required for Done
- Results artifact set in `docs/testing/benchmarks/results/<date>/`.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "device performance|protocol" docs/testing/benchmarks webapp/src/hooks/useSignLanguageDetector.ts`

## Progress notes (2026-04-06)
- Added a reproducible evaluator at `scripts/evaluate_device_protocol_results.py` plus protocol clarifications in `docs/testing/benchmarks/device-performance-protocol.md` for battery and camera-flip thresholds and the canonical `sustained_session_summary.csv` gate input.
- Added synthetic evaluator verification in `server/test/test_device_protocol_evaluator.py`.
- Remaining blocker: the required P0/P1 real-device artefacts are not present in this workspace, so the protocol cycle itself cannot be truthfully marked done.
