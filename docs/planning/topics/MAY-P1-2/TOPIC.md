# MAY-P1-2 — Signer leakage quality gate

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-03
- **Status authority:** `docs/planning/TODO.md`

## Amy impact
- Prevents inflated metrics and protects Amy from brittle personalization quality in real-world use.

## Scope
- Add hard signer-leakage validation for few-shot train/val/test manifests.
- Ensure reports include known-signer vs new-signer metric split.

## Entry points
- `server/src/amyserver_tools/train_mlp_fewshot.py`
- `server/src/amyserver_tools/train_mlp_sweep.py`
- `server/test/`

## Evidence required for Done
- Leakage validator + failing regression test + passing run with signer-split report.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "signer|leakage|profile|manifest" server/src/amyserver_tools server/test`

## Sync rule
- Update `TODO.md` first for status changes, then refresh this topic file details.
