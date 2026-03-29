# Detection Test Matrix

## Baseline commands

- `npm run type-check --prefix webapp`
- `npm run lint --prefix webapp`
- `npm test --prefix webapp`

## Targeted detection evidence

- `npm --prefix webapp run diagnose:fixtures`
- Run focused tests in changed files under:
  - `webapp/src/gesture/`
  - `webapp/src/hooks/`
  - `webapp/src/training/` (when training-runtime coupling changed)

## Identity-sensitive additions (when profile/auth flows touched)

Also include at least one failure-path check for:

- expired session (`401`),
- missing or stale `profileId`,
- no false success state in UI after server failure.

## Final PR gate (before merge)

Recommended order: type-checks first, then lint, then tests.

- `npm run type-check --prefix webapp`
- `npm run type-check --prefix server`
- `npm run lint --prefix webapp`
- `npm test --prefix webapp`
- `npm test --prefix server`
- `npm test --prefix integration`
