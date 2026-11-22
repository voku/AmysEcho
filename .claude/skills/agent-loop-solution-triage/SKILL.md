---
name: agent-loop-solution-triage
description: Determine whether existing repository code, helpers, UI, or tests already satisfy a requirement, ticket, or bug report before writing duplicate code.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Solution Triage

Use this skill when the primary question is not "how do we implement this?" but "does the repository already do this?"

## Operating Principles

1. **Search Before Designing**: before writing new classes, helpers, or database queries, search existing services, utilities, and tests using `vendor/bin/agent-loop map query`, `map related`, or `rg`.
2. **Classify the Findings**:
   - `already_implemented`: existing code already satisfies the requirement. Report the exact code anchors and stop.
   - `verification_only`: implementation exists, but lacks test proof or browser verification. Write the minimal test command or proof needed.
   - `small_patch_needed`: an existing abstraction or workflow already does 90% of the job; only a localized parameter, guard, or helper call is missing.
   - `new_implementation_required`: verified search proves no existing solution exists; genuine new logic is needed.
   - `unclear`: requirements or user intent are underspecified.
3. **Evidence Anchors**: cite exact file paths, line numbers, and symbol identities proving why the classification was chosen.
