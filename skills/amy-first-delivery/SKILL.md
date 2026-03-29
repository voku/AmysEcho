---
name: amy-first-delivery
description: Apply Amy's Echo Amy-first delivery workflow for implementation and review tasks. Use when changing code, tests, or docs in this repository and you need to enforce discovery, planning, Amy-impact validation, and mandatory verification before merge.
---

# Amy First Delivery

Follow this workflow every time you implement or review a repository change.

## 1) Run discovery before editing

1. Read `docs/planning/TODO.md` to align with active roadmap priorities.
2. Read the workflow/testing docs listed in `references/discovery-sources.md`.
3. Inspect existing code paths before creating new patterns.
4. Note a one-sentence **Amy impact** statement in your plan.

## 2) Plan explicitly

Create a short plan that includes:

- Files to touch.
- Existing patterns to reuse.
- Risk points (auth/profile boundaries, offline behavior, user-visible German text).
- Test/check commands to run.

## 3) Implement with Amy-first guardrails

- Prefer reliability over refactor churn.
- Keep user-facing app text in German.
- Use standard library patterns when they are already clear.
- Update docs when behavior, process, or evidence expectations change.

## 4) Verify in layers

1. Run focused tests for changed area.
2. Run type checks/lint relevant to touched packages.
3. Run broader tests if integration risk exists.
4. Document command outputs and classify pass/warning/fail.

## 5) Ship with evidence

- Summarize what changed and why it helps Amy's communication reliability.
- Include concrete test evidence and note any environment limitations.
- If discovery reveals stale docs, update them in the same change when possible.

## References

- Discovery and required reading: `references/discovery-sources.md`
- Amy-first execution checklist: `references/amy-first-checklist.md`
