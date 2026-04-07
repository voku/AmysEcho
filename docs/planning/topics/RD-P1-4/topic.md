# RD-P1-4 — Realistic DGS test and training protocol

## Kanban Status
- **Column:** Backlog
- **Owner:** Unassigned
- **Last updated:** 2026-04-06
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
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "signer|leakage|split|snapshot|DGS" docs/testing/benchmarks docs/training server/src/amyserver_tools server/test`

## Sync rule
- Update the protocol doc first when the benchmark rules change, then update this topic file and any linked planning index.
