# RD-P1-1 — Confidence calibration + abstention

## Kanban Status
- **Column:** Done
- **Owner:** Codex (GPT-5.3-Codex)
- **Last updated:** 2026-04-05
- **Status authority:** `docs/planning/todo-done.md` (archived completion)

## Amy impact
- Reduces harmful wrong predictions by preferring safe abstention when uncertain.

## Scope
- Define and implement confidence threshold policy with evidence.

## Entry points
- `webapp/src/gesture/installMlp.ts`
- `webapp/src/gesture/modelClient.ts`
- `webapp/src/hooks/useSignLanguageDetector.ts`

## Evidence required for Done
- Threshold policy document plus calibration artifact in benchmarks.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Progress notes (2026-04-05)
- Verified existing calibration/abstention behavior in `ProcessingSteps.ts` and related tests.
- Published threshold policy and calibration matrix in `docs/testing/benchmarks/rd-p1-1-confidence-calibration-2026-04-05.md`.
- Confirmed observability path with `useSignLanguageDetector` telemetry rejection assertions.
- First command executed for this task: `rg -n "confidence|abstention|threshold" webapp/src/gesture webapp/src/hooks docs/testing/benchmarks`.

## Next command
- `rg -n "RD-P1-1|confidence calibration|abstention" docs/planning/todo.md docs/planning/todo-done.md docs/testing/benchmarks`
