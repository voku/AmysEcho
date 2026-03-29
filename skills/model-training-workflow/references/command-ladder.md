# Training Command Ladder

Run from repo root.

## Level 1 — always for training workflow changes

1. `npm run train:workflow:smoke --prefix server`

Expected signal:
- exit code `0`
- JSON output with `"status": "ok"`

## Level 2 — targeted verification

2. `PYTHONPATH=./server/src:./server:./server/training python -m pytest -q server/test/test_train_mlp_sweep.py`
3. `npm run test:ts --prefix server -- latestMlpModelRoute.test.ts`

## Level 3 — broader confidence

4. `npm test --prefix server`
5. `cd integration && node test-runner.js ci` (pre-tag or major cross-stack changes)

Use Level 3 when trainer output, serving routes, or auth/profile-scoped training flows changed together.
