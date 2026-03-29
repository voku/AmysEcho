---
name: testing-quality-gate
description: Run Amy's Echo testing and quality gates with clear evidence reporting. Use when preparing a change for commit/PR, diagnosing regressions, or deciding the minimum safe check set for touched webapp, server, or integration areas.
---

# Testing Quality Gate

Select and execute the smallest complete test matrix that still protects Amy's communication reliability.

## 1) Choose the scope

Map touched files to packages:

- `webapp/` → webapp checks
- `server/` → server checks
- `integration/` or cross-stack flow → integration checks
- docs-only → lightweight validation (links/scripts if available)

## 2) Run ordered checks

Start narrow, then widen:

1. Focused test file(s) for changed behavior.
2. Package type-check and lint.
3. Package full tests.
4. Build checks for deployable surfaces.
5. Integration tests for cross-stack or auth/profile workflow risk.

Use canonical commands from `references/command-matrix.md`.

## 3) Investigate failures before retry

- Confirm whether failure is change-induced or pre-existing.
- Capture first failing command and root-cause notes.
- Prefer fixing nearby pre-existing issues when safely in scope.

## 4) Report evidence clearly

For each executed command, report pass/warning/fail and one-line context.

## References

- Command matrix: `references/command-matrix.md`
- Failure triage template: `references/failure-triage-template.md`
