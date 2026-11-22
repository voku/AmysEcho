---
name: agent-loop-learning-boundary
description: Handle reusable knowledge that surfaces during a task, record honest Recall outcomes, close the governed Run learning decision, and keep findings separate from reviewed durable guidance.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Loop Learning Boundary

**Trigger Anchor:** Post-implementation / pre-close learning disposition -> log truthful Recall outcomes, validate Learning root, record Run learning decision (`findings_recorded`, `no_durable_learning`, or `follow_up_required`), never treat raw findings as approved guidance.

## Core Boundary

```text
Finding (raw observation)
  -> Proposal (structured candidate)
  -> Reviewed Decision (named human/governed authority)
  -> Durable Guidance (active rules / constraints)
```

Findings are **not** durable memory. A Run learning close-out records what happened; it does not approve future rules or alter guidance without a reviewed decision.

## Learning Disposition Table

| Situation | Status | Command Template | Required Arguments |
|---|---|---|---|
| Reusable lesson discovered | `findings_recorded` | `vendor/bin/agent-loop workflow learn <task-id> --finding <id> --by <actor>` | `--finding <id>`, `--by` |
| One-off fix / already known, no review observations | `no_durable_learning` | `vendor/bin/agent-loop workflow learn <task-id> --status no_durable_learning --by <actor>` | `--status`, `--by` |
| Out-of-scope follow-up | `follow_up_required` | `vendor/bin/agent-loop workflow learn <task-id> --follow-up <ref> --by <actor>` | `--follow-up <ref>`, `--by` |

`--finding` and `--follow-up` already state the decision. `--reason` is optional context: do not write a sentence to say nothing durable was learned.

## Fast Path Sequence

1. **Recall Close-out:** Log the compiled draft so Recall records the selected guidance as machine evidence. Add outcome rows only for guidance you actually judged; an untouched sparse draft is valid when nothing notable happened. A `helpful` row needs `attribution`: `seen_before_decision` is `false` when you first opened the guidance while filling the draft, and `also_prescribed_by` lists the task prompt, Contract, skill, template, Constraint, or repository docs that already prescribed the same decision (`[]` only if nothing else did). Honest `false`/non-empty answers are valid evidence; do not tune them toward attribution. If `finish` reports `learning_maintenance`, a relevant LearningNote was withheld for evidence drift in files you touched: review it with the named command and republish or retire it only through the Learning owner.
   ```bash
   vendor/bin/agent-loop recall log-outcome \
     --draft <recall-root>/<task-id>/recall-log.draft.json \
     --by <actor> \
     --commit <sha>
   ```
2. **Validate Learning Root:**
   ```bash
   vendor/bin/agent-loop learn validate
   ```
3. **Evaluate Reusable Learning, Then Record the Decision:** Before choosing the Learning disposition, decide whether the run exposed an evidence-backed reusable lesson. Finding creation stays sparse, but this evaluation is not optional.
   - First read the observations that passing reviews recorded: `review_observations` in `vendor/bin/agent-loop pipeline status <task-id> --format=json`, also projected under `learning_disposition` in the `finish` JSON. While any exist, `no_durable_learning` is refused: capture the reusable ones as Findings and/or link the issue that tracks the rest with a follow-up reference.
   - Reusable lesson: capture it through the Learning owner, then reference the resulting Finding:
     ```bash
     vendor/bin/agent-loop learn capture \
       --task <task-id> \
       --by <actor> \
       --observation "<what happened>" \
       --hypothesis "<why it happened>" \
       --evidence "<where it was observed>"

     vendor/bin/agent-loop workflow learn <task-id> \
       --finding <finding-id> \
       --by <actor>
     ```
   - Concrete out-of-scope work remains: record `follow_up_required` with its real reference.
   - No reusable lesson, no follow-up, and no recorded review observations: explicitly record `no_durable_learning`:
     ```bash
     vendor/bin/agent-loop workflow learn <task-id> \
       --status no_durable_learning \
       --by <actor>
     ```

   Do not choose `no_durable_learning` merely to make the Run complete.

### Bad vs Good Learning Disposition

### Bad
Self-approving a finding into durable guidance to bypass human review:
```bash
# Pretending a raw task observation is instantly an approved rule
vendor/bin/agent-loop workflow learn TASK-1 --status findings_recorded --by self --reason "I learned this so it is now a rule"
```

### Good
Separating task close-out from durable promotion:
```bash
# Record the finding in the task Run, validate candidate, await human review
vendor/bin/agent-loop workflow learn TASK-1 \
  --status findings_recorded \
  --finding finding.TASK-1.001 \
  --by model-agent \
  --reason "Discovered that Docker container names require explicit prefixing on host."
```

## Guidance & Memory Commands

- **Evaluate Drift:** `vendor/bin/agent-loop learn guidance-evaluate` (read-only audit of existing guidance).
- **Memory Queue:** `vendor/bin/agent-loop memory review --file=MEMORY.md` (inspect candidates without modifying durable memory).
- **Proposal Validation:** `vendor/bin/agent-loop learn proposal-validate --proposal <path>` (structural schema check).

## Validation Check

Before `workflow close --status done`:
- Recall selection events are logged for the compilation; guidance outcomes exist only for items actually judged.
- `vendor/bin/agent-loop learn validate` exits with code 0.
- Exactly one truthful Run learning decision is recorded.
- No synthetic human approvals or unreviewed promotions were fabricated.
