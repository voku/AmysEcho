# Discovery-first investigation

Use this workflow for unclear or stale engineering tasks, PR re-grounding, or a root-cause deep dive before deciding what to change. It is a **skill entrypoint** into the existing bundled `discovery-first` L2 recipe, not an additional meta-prompt, hidden trigger, or autonomous workflow stage.

## Invocation

The caller selects the recipe explicitly. In a governed `agent-loop` run, make that selection through the task's approved Contract and let Loop own lifecycle authority. For a standalone exploratory briefing:

```bash
vendor/bin/agent-recall-compiler compile \
  --task DISCOVERY-123 \
  --description "Re-ground the current PR and identify the smallest evidence-backed next slice" \
  --operating-prompt-source bundled \
  --operating-prompt '{"id":"discovery-first","arguments":{}}'
```

Add exact `--file` or `--target` anchors only when known. Exact targets require an explicitly supplied Map index; do not invent one, and do not force Map for text/configuration questions. Resolve project roots through the installed `agent-loop` wrapper when a governed workflow owns them.

## Consumption and stopping

The CLI compiles deterministic evidence and the selected L2 recipe into `system.md`. The receiving agent/harness then constructs the **project-specific L1** with `Goal`, `Context`, `Constraints`, `Verification`, and `Done When`. Constructing L1 is not conducting the investigation: the execution host must actually perform the authorized, bounded probes before asserting an outcome.

Investigate the highest-value falsifiable hypotheses against current source, issue/PR state, tests, and relevant runtime boundaries. Reuse compiled owner facts instead of repeating discovery merely to produce more tool activity. For each material claim, distinguish `VERIFIED`, `INFERRED`, `UNKNOWN`, `BLOCKED`, and `CONTRADICTED`; cite exact anchors for verified claims. `NO_CHANGE` is a legitimate result when the observed state already satisfies the question.

Stop when the investigation can name the smallest evidence-backed next slice, its semantic owner and distinguishing verification probe, **or** when all further relevant probes are blocked by a specific unavailable source or decision. Report unresolved hypotheses rather than manufacturing certainty. Investigation is not approval for implementation, scope expansion, creating backlog, or bypassing human/security decisions.

## Missing indexed evidence

A declared PHP path is task scope, **not** proof that symbols were compiled. If Map is not configured, or the compiler emits a `navigation_status` indicating unavailable/missing/stale indexed context, this is **not** proof that the source file or its symbols do not exist. Inspect the current authoritative source before making symbol-level claims. Treat Map currentness/preparation as Map-owned and workflow authority as Loop-owned. Do not reconstruct Map indexing inside Recall or turn a missing index into a required dependency for unrelated non-PHP tasks.

For a durable multi-slice follow-up use the separately selected `todo-card-handoff` recipe and the existing task owner. For authorized execution of a pre-existing bounded slice use `execution-dispatch`. Discovery alone creates neither one.
