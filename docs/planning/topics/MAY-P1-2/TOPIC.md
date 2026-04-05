# MAY-P1-2 — Signer leakage quality gate

## Kanban Status
- **Column:** Done
- **Owner:** ML/Platform owner
- **Last updated:** 2026-04-04
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
- [x] Discovery complete
- [x] Implementation complete (incremental hardening: stricter split-manifest validation plus held-out signer metrics wired into few-shot trial reports)
- [x] Tests pass (`pytest server/test/test_train_mlp_fewshot.py server/test/test_train_mlp_sweep.py -q`)
- [x] Evidence committed

## Next command
- `pytest server/test/test_train_mlp_fewshot.py server/test/test_train_mlp_signer_split.py server/test/test_train_mlp_sweep.py -q`

## Sync rule
- Update `TODO.md` first for status changes, then refresh this topic file details.
