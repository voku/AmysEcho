---
name: agent-loop-code-review
description: Govern a read-only review of the complete raw diff using the guaranteed Loop/Recall first-draft contract, with at most one optional focused engineering-lens handoff while preserving exact evidence and deterministic terminal state.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Loop Code Review

Own the review workflow, not the engineering handbook.

## Contract

1. Review the complete raw diff and task/brief evidence. Never review a summary instead.
2. For a governed task, run `agent-loop review code <task-id>` first and use the generated task-artifact-backed prompt as the review framing. It carries Recall's first-draft falsification lens and evidence boundaries; do not replace it with remembered prose.
3. If there is no governed task/artifact set and only a context-light adversarial pass is needed, use `agent-loop review first-draft` instead.
4. Treat that generated first-draft framing as the guaranteed default correctness-review capability. A normal review must remain executable when no optional `code-review-*` engineering lens is installed.
5. Use `agent-loop map changed --base=<ref>` and focused caller/context lookup when a claim depends on surrounding code. Verify against real source and make concrete falsification attempts against the task contract.
6. If one installed `code-review-*` engineering lens is clearly applicable to the most material concern, optionally deepen that concern with at most one `HANDOFF:`. Do not run a default review swarm and do not block merely because no optional lens is installed.
7. A `HANDOFF:` must name an installed lens plus evidence `path:line` and why that concern is dominant. Without such a lens, continue the default first-draft review instead of inventing a missing-capability failure.
8. Persist/report the review result without turning it into workflow approval. `review blindspots` remains a separate deterministic process/evidence check.
9. Read-only. Do not apply fixes during review.

The first-draft lens is adversarial without creating a finding quota. `STATUS: clean` remains valid after concrete falsification attempts find no evidence-backed defect. Missing material evidence stays `UNKNOWN`/`blocked`; model confidence, prior rationale, prompt construction, or an unexecuted command are not verification.

## Optional Deterministic Observation

When `init tools` reports `slop-scan` as available, it can supply heuristic
findings alongside the default review. Ask it for the delta between the base and
the candidate — do not hand-roll one from two `scan` runs:

```bash
<reported-path> delta <base-checkout> . --json --ignore 'vendor/**'
```

Its `added` count includes findings whose only change is a line number, so
match `added` against `resolved` by rule, path and line content first.

- existing repository slop is not a finding against this diff; the change owns
  new findings, resolved findings and changed fingerprints;
- a heuristic hit is an observation, not a verdict: promote it to
  `STATUS: findings` only when you can state the defect and the concrete fix
  from the real source;
- no score threshold decides a review outcome.

The tool is an optional input. It does not replace the default first-draft review,
does not add a second mandatory lens, and its absence does not block a review.

Review results are:

```text
STATUS: findings
<path>:<line>: <severity> <problem>. <concrete fix>.
HANDOFF: <code-review-* lens> <path>:<line> <why this concern is dominant>   # optional, at most one
```

```text
STATUS: clean
OBSERVATION: <path>:<line> <non-blocking finding>   # zero or more: known limit, nit, follow-up
```

```text
STATUS: blocked
UNKNOWN: <exact material evidence gap that prevents the default review>.
```

Correctness comes from the guaranteed first-draft falsification contract plus exact source evidence. An installed engineering capability may deepen one concern, but its absence is not a failure of the default path. `agent-loop` owns scope, routing, persistence, and workflow progression.
