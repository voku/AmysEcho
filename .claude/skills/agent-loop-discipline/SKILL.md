---
name: agent-loop-discipline
description: "Minimal governed bootstrap: persisted workflow routing, evidence integrity, and bounded workflow output."
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Loop Discipline

Rule: persisted workflow state beats conversational state. Keep attention bounded.

## Governed Workflow

The lifecycle decides what happens next; this SessionStart skill adds no independent ordering rules.

```bash
vendor/bin/agent-loop enter <task-id> --format=json
vendor/bin/agent-loop finish <task-id> --format=json
```

Do not decide mutation legality, gates, contract currency, or superseded scope. The canonical result owns them. If its command refuses without changing the next step, report a workflow defect; do not invent choreography.

SessionStart/SubagentStart hints are navigation only. Never infer approval, validation, review, learning, product intent, or a next command from them.

Human authority exists only for lifecycle `decision_required`; present its exact subject after resolving agent-owned facts. Follow `agent-loop-workflow`'s Decision & Review Presentation guidance for language, choices, recommendations, and authority boundaries. Ordinary review acknowledgement and Learning disposition stay agent work unless the lifecycle says otherwise.

## Workflow Evidence Integrity

Never fabricate workflow state or runtime facts. Preserve exact commands, errors, diffs, contracts, and verification artifacts. Summaries may point to evidence; they never replace it. General uncertainty reasoning belongs to `engineering-codelight`.

## Workflow Output

Update only on result, blocker, scope, decision, or phase change:

```text
RESULT: <verified result, decision, artifact, or blocker>
STATE: <phase> <task-id> <Contract revision when known>
NEXT: <one agent-owned action or exact human gate>
```

On completion:

```text
RESULT: <what changed and why>
EVIDENCE: <exact validation results and decisive artifacts>
OMITTED: <deliberate omissions plus revisit trigger, or none>
```

Receipts compress narration, never evidence.
