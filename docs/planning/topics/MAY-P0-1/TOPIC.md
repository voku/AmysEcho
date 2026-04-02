# MAY-P0-1 — Few-shot runner automation

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-02

## Amy impact
- Speeds up model iteration so Amy can receive better personalized recognition faster.

## Scope
- Implement profile × shot × seed few-shot runner.

## Entry points
- `server/src/amyserver_tools/train_mlp.py`
- `server/src/amyserver_tools/train_mlp_sweep.py`

## Evidence required for Done
- Runner committed plus generated artifacts in benchmark results.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "fewshot|shot|seed" server/src/amyserver_tools`
