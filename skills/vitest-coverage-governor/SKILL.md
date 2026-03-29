---
name: vitest-coverage-governor
description: Configure and enforce Vitest coverage quality gates for Amy's Echo webapp changes. Use when adding tests, tuning coverage thresholds, fixing flaky coverage regressions, or defining test include/exclude behavior in Vite/Vitest.
---

# Vitest Coverage Governor

Use this skill to keep webapp testing signals trustworthy and enforceable.

## 1) Choose the right test scope

- For local fast iteration: run focused file tests first.
- For merge confidence: run full `npm test --prefix webapp`.
- For gate verification: run `npm run test:coverage --prefix webapp`.

## 2) Keep coverage config intentional

- Ensure include/exclude patterns match real source ownership.
- Avoid inflating coverage via irrelevant file exclusions.
- Raise thresholds incrementally with passing evidence.

## 3) Triage coverage drops

1. Identify which files regressed.
2. Add or improve behavior-level assertions.
3. Re-run focused suite, then full coverage.
4. Document regression root cause and fix.

## 4) Align with Amy-first reliability

Prefer tests that capture:

- failure-path behavior,
- auth/profile boundary behavior,
- UI states that could falsely claim success.

## References

- Official Vitest docs: `references/official-vitest-docs.md`
- Coverage triage playbook: `references/coverage-triage-playbook.md`
