---
name: agent-loop-blindspot-review
description: Stress-test proposed changes, execution plans, or open diffs with evidence-first blind-spot review, failure-mode analysis, and clear verdicts.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Blindspot Review

Use this skill when the goal is to challenge a plan, proposed change, or open diff before implementing or approving it.

## Presentation options

For a governed task, read the `prompting` projection from `agent-loop workflow context <task-id> --format=json`. For an untracked review, read `prompting` from `.agent-loop/init.json` if present. The defaults are `language: en` and `tone: measured`. Treat these as presentation preferences only; they never change review evidence, status tokens, or workflow authority.

- Write explanatory prose in the configured language. Preserve exact source text, paths, commands, citations, and machine-readable status tokens.
- `direct` tone means state evidenced weaknesses and consequences plainly. Do not speculate about the author's motives or use personal insults.
- `unflinching` tone means challenge unsupported confidence and name the most uncomfortable verified failure plainly. Keep every claim evidence-bound; forceful wording never supplies evidence.
- Scope the analysis to the user's stated project, workflow, decision, or concern. An optional `review blindspots <task-id> --focus '...'` adds a one-line scope hint to the generated review prompt. Ask for a missing focus only when the requested review cannot be scoped from the available task artifacts.

## Operating Principles

1. **Evidence First**: inspect changed files, nearest comparable patterns, and relevant test coverage before concluding.
2. **Tripartite Claims**:
   - `Observed`: directly verified in source, configuration, tests, or command output.
   - `Inferred`: reasoned from sequencing, contracts, or likely runtime consequences.
   - `Unknown`: requires maintainer clarification, production context, or an empirical reproduction test.
3. **Pressure-Test Critical Seams**:
   - Partial failure & rollback: what happens if an intermediate operation throws or times out? Is state left corrupted or orphaned?
   - Invariant enforcement: are preconditions checked at system boundaries or implicitly trusted downstream?
   - Observability & secrecy: are failure paths actionable for operators without logging credentials, tokens, or personal data?
   - User feedback: does every reachable branch (including failure/early return) provide explicit user feedback?
   - Backward compatibility: does the change break existing callers, database schemas, serialized formats, or public API contracts?
4. **Actionable Mitigations**: identify the single dominant hidden trade-off and name the smallest constructive next action.
