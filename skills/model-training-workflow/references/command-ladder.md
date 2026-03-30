# Training Command Ladder

Run from repo root.

## Level 1 — always for training workflow changes

1. `npm run train:workflow:smoke --prefix server`

Expected signal:
- exit code `0`
- JSON output with `"status": "ok"`

## Level 2 — targeted verification

2. `PY_BIN=$(node ./server/scripts/resolve-python-bin.mjs) && PYTHONPATH=./server/src:./server:./server/training "$PY_BIN" -m pytest -q server/test/test_train_mlp_sweep.py`
3. `npm run test:ts --prefix server -- latestMlpModelRoute.test.ts`

## Level 3 — broader confidence

4. `npm run type-check --prefix webapp`
5. `npm run lint --prefix webapp`
6. `npm run type-check --prefix server`
7. `npm run lint --prefix server`
8. `npm test --prefix webapp`
9. `npm test --prefix server`
10. `npm test --prefix integration`

Level 3 acceptance criteria: pass all listed type-check/lint commands for touched TypeScript surfaces and pass all three package test suites before completion.
Use Level 3 when trainer output, serving routes, or auth/profile-scoped training flows changed together.
