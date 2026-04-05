# APR-P0-2 — First device performance measurement cycle

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-02

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
