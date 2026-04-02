# RD-P0-3 — Signer-independent evaluation gate

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-02

## Amy impact
- Prevents inflated metrics and protects Amy from brittle models in real use.

## Scope
- Add leakage validator for signer-separated manifests and reporting.

## Entry points
- `server/src/amyserver_tools/train_mlp.py`
- `server/src/amyserver_tools/train_mlp_sweep.py`
- `server/test/`

## Evidence required for Done
- Validator + failing leakage test + signer-split metrics report.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "signer|leakage|manifest" server/src/amyserver_tools server/test`
