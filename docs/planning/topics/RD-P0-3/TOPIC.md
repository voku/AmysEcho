# RD-P0-3 — Signer-independent evaluation gate

## Kanban Status
- **Column:** In Progress
- **Owner:** Codex (GPT-5.3-Codex)
- **Last updated:** 2026-04-04

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
- [x] Discovery complete
- [x] Implementation complete (partial scope: train/sweep leakage gate + tests)
- [x] Tests pass
- [x] Evidence committed

## Progress notes (2026-04-04)
- Added reusable signer/bundle leakage validator in `train_mlp.py`.
- Refactored `train_mlp_sweep.py` to require explicit split inputs (`--train-manifest` + `--heldout-manifest`) and surfaced signer split counts in sweep JSON output.
- Added tests for validator behavior and sweep output contract in `server/test/test_train_mlp_signer_split.py`.
- First command executed for this task: `rg -n "signer|leakage|manifest" server/src/amyserver_tools server/test`.
- Realistic sweep smoke test executed with synthetic manifests and on-disk landmarks via:
  `python server/src/amyserver_tools/train_mlp_sweep.py --train-manifest /tmp/amy_sweep_integration_data/datasets/train_manifest.json --heldout-manifest /tmp/amy_sweep_integration_data/datasets/heldout_manifest.json --data-dir /tmp/amy_sweep_integration_data --epochs 1 --learning-rates 0.001 --dropouts 0.2 --early-stopping 1 --trials 1 --skip-examples`.

## Next command
- `rg -n "signer|leakage|manifest" server/src/amyserver_tools server/test`
