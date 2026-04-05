# MAY-P0-2 — Few-shot parser/aggregation test hardening

## Kanban Status
- **Column:** Done
- **Owner:** Team
- **Last updated:** 2026-04-02

## Amy impact
- Improved reliability of few-shot metrics by enforcing strict schema + aggregation tests.

## Scope
- Preserve evidence context and acceptance summary for this completed roadmap item.

## Entry points
- `server/test/test_train_mlp_fewshot.py`
- `server/test/test_train_mlp_sweep.py`

## Evidence required for Done
- Tests committed and passing for strict metric schema and aggregation.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Next command
- `rg -n "MAY" docs/planning docs/testing server/test scripts`
