# MAY-P1-3 — Few-shot baseline on current training snapshot

## Kanban Status
- **Column:** Blocked
- **Owner:** Unassigned
- **Last updated:** 2026-04-06
- **Status authority:** `docs/planning/todo.md`

## Amy impact
- Turns the new few-shot runner from fixture-only proof into a current signer-safe quality baseline that can guide real model decisions for Amy.

## Scope
- Run the default `train_mlp_fewshot.py` workflow against a current non-fixture dataset snapshot using the leakage-safe protocol.
- Publish human-readable and machine-readable artifacts plus a short interpretation of known-signer vs new-signer behaviour.
- Out of scope: changing the runner contract or introducing a new model architecture.

## Entry points
- `server/src/amyserver_tools/train_mlp_fewshot.py`
- `docs/testing/benchmarks/few-shot-protocol.md`
- `docs/testing/benchmarks/results/2026-04-05/may_p0_1_runner_artifacts/`

## Evidence required for Done
- Committed run artifacts for a current dataset snapshot including `split_manifest`, `summary.json`, and `summary.md`.
- Short interpretation note linking baseline quality to signer leakage and generalization expectations.

## Checklist
- [ ] Discovery complete
- [ ] Implementation complete
- [ ] Tests pass
- [ ] Evidence committed

## Next command
- `rg -n "few-shot|split_manifest|summary.json|summary.md" server/src/amyserver_tools docs/testing/benchmarks`

## Sync rule
- Update `todo.md` first for status changes, then refresh this topic file details.

## Progress notes (2026-04-06)
- The few-shot runner and its artifact contract are already in place from MAY-P0-1.
- Remaining blocker: the workspace currently has no active non-fixture `training_manifest.json` snapshot to evaluate, so the required evidence for a live baseline run cannot be generated honestly from local state.
