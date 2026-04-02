# RD-P1-1 — Confidence calibration + abstention

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-02

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
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "confidence|abstention|threshold" webapp/src/gesture webapp/src/hooks docs/testing/benchmarks`
