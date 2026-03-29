# Detection Test Matrix

## Baseline commands

- `npm run type-check --prefix webapp`
- `npm run lint --prefix webapp`
- `npm test --prefix webapp`

## Targeted detection evidence

- `npm run diagnose:fixtures --prefix webapp`
- Run focused tests in changed files under:
  - `webapp/src/gesture/`
  - `webapp/src/hooks/`
  - `webapp/src/training/` (when training-runtime coupling changed)

## Identity-sensitive additions (when profile/auth flows touched)

Also include at least one failure-path check for:

- expired session (`401`),
- missing or stale `profileId`,
- no false success state in UI after server failure.
