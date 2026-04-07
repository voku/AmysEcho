# RD-P1-4 — Realistic DGS test and training protocol

## Kanban Status
- **Column:** Done
- **Owner:** Team
- **Last updated:** 2026-04-07
- **Status authority:** `docs/planning/todo.md` for shared cleanup context, `docs/planning/topics/` for this topic

## Amy impact
- Reduces false confidence from mismatched DGS sources and protects Amy from models that look good in metrics but fail in real use.

## Scope
- Define a realistic DGS evaluation protocol for isolated classification, continuous recognition, and translation.
- Align the protocol with the current landmark-window training pipeline and leakage-safe split rules.
- Separate training data tiers from real-world test material.

## Out of scope
- Building a full SLT model.
- Clearing external licenses or collecting new copyrighted data.
- Reworking the supported core product scope.

## Entry points
- `docs/testing/benchmarks/dgs-realistic-protocol.md`
- `docs/testing/benchmarks/few-shot-protocol.md`
- `docs/training/baseline-model-pipeline.md`
- `docs/training/per-user-label-training.md`
- `server/src/amyserver_tools/train_mlp.py`
- `server/test/`

## Evidence required for Done
- A published DGS protocol doc with task matrix, split rules, and reproducibility rules.
- A linked benchmark snapshot or fixture set that follows the protocol.
- A short note explaining which data tiers are allowed for training versus test-only use.

## Checklist
- [x] Discovery complete
- [x] Implementation complete
- [x] Tests pass
- [x] Evidence committed

## Evidence
- Protocol doc: `docs/testing/benchmarks/dgs-realistic-protocol.md`
- Benchmark snapshot: `docs/testing/benchmarks/rd-p1-4-realistic-dgs-cycle-2026-04-07.md`
- Outcome: repository-fixture cycle now runs under the current feature-contract trainer gate, but best top-1 accuracy was `0.3161764706`, below the `0.35` usable threshold; keep this as fixture-level workflow evidence, not production training proof.
- Verification: `python3 -m pytest -q server/test/test_realistic_dgs_training_cycle.py`; `python3 scripts/realistic_dgs_training_cycle.py --workflow-preset chat-validated-2026-03 --timeout-seconds 600 --report-path /tmp/rd-p1-4-realistic-dgs-cycle-report.json`.

## Next command
- `rg -n "signer|leakage|split|snapshot|DGS" docs/testing/benchmarks docs/training server/src/amyserver_tools server/test`

## Sync rule
- Update the protocol doc first when the benchmark rules change, then update this topic file and any linked planning index.
