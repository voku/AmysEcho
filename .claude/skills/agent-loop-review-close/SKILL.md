---
name: agent-loop-review-close
description: Review and close a governed agent-loop task through the canonical finish front door while preserving explicit review and Learning inputs.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Loop Review Close

**Trigger Anchor:** Implementation and validation complete -> execute review commands, present evidence, supply explicit review/learning inputs, and close via `agent-loop finish`.

## Fast Path

When there is no valid governed task id, route directly to the context-light first-draft review instead of invoking task-bound workflow commands:
```bash
vendor/bin/agent-loop review first-draft
```

For a governed task, resolve current state first:
```bash
vendor/bin/agent-loop workflow status <task-id> --format=json
```

1. **Review Correctness & Blindspots:**
   ```bash
   vendor/bin/agent-loop review code <task-id>
   vendor/bin/agent-loop review blindspots <task-id>
   ```
2. **Canonical Close Front Door:**
   ```bash
   vendor/bin/agent-loop finish <task-id> [finish inputs from next_action]
   ```
   Obey the returned `next_action` and `next_action_kind` until `next_action == "none"` and `complete == true`.
   Finish the changes, commits and Learning records before the first `finish`, and acknowledge only the exact report hash it currently names: the blind-spot report is regenerated whenever the implementation or Learning records change, so a hash acknowledged earlier goes stale and the same gate comes back. Read the report before acknowledging it; fix real findings first, then finish.

## Learning Disposition Inputs

Supply exactly one truthful conclusion when `finish` prompts for it:
- `findings_recorded`: reusable evidence-backed findings exist (reference validated IDs).
- `no_durable_learning`: changes are task-local or already covered by authoritative guidance, and no passing review recorded observations (`finish` refuses it while `review_observations` is non-empty).
- `follow_up_required`: an unresolved item remains that cannot safely be closed in this Contract.

## Optional Reflection

Reflection is not one of the workflow lifecycle phases. It is a read-only prompt primitive that may add scrutiny without becoming alternate close-out choreography.

When the task is ready to close, optional task reflection is:
```bash
vendor/bin/agent-loop workflow reflect <task-id> --scope task
```
If it returns `RETURN_TO_REVIEW`, resolve that concrete review gap and return to `finish`. Do not translate reflection output directly into lifecycle state.

After successful completion, optional project reflection can surface future investment:
```bash
vendor/bin/agent-loop workflow reflect <task-id> --scope project
```
Any resulting follow-up requires its own normal governance and approval.

### Bad vs Good Close-out

### Bad
```bash
# Bypassing finish with manual close and fabricated approvals
vendor/bin/agent-loop workflow close TASK-1 --status done --accept-risk
```

### Good
```bash
# Governed review and finish loop
vendor/bin/agent-loop review code TASK-1
vendor/bin/agent-loop review blindspots TASK-1
vendor/bin/agent-loop finish TASK-1
```
