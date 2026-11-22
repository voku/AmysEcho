---
name: agent-loop-task-progress
description: Record bounded working memory during an agent-loop task, including decisions, checkpoints, validation evidence, scope changes, simplification ceilings, and blockers without copying raw evidence.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Loop Task Progress

**Trigger Anchor:** During implementation -> record bounded decisions, checkpoints, validation evidence, and simplification ceilings into session memory; never copy giant logs or unverified prose.

## Fast Path Commands

| Operation | Command Template | When to Use |
|---|---|---|
| Record Decision | `vendor/bin/agent-loop session record <task-id> --kind decision --title "<title>" --body "<body>"` | Architectural or scope choices |
| Record Checkpoint | `vendor/bin/agent-loop session checkpoint <task-id> --title "<phase>" --body "<progress>"` | Approach selected, risky code edited, blocked |
| Structured Validation | `vendor/bin/agent-loop session validation record <task-id> --contract-revision <rev> --command "<cmd>" --status passed --exit-code 0 --by <actor>` | Meaningful test run passing |
| Inspect Working State | `vendor/bin/agent-loop session show <task-id>`<br>`vendor/bin/agent-loop workflow status <task-id>` | Resume or audit current progress |

## Checkpoint Triggers

Checkpoint after:
1. Selecting an implementation direction.
2. Modifying a public contract or risky subsystem.
3. Every meaningful validation test run.
4. Scope changes or contract supersession.
5. Becoming blocked (stating root cause and unblock condition).
6. Reaching review readiness.

## Simplification Ceilings

When accepting a deliberate simplification, never leave anonymous `TODO`s in code. Record the decision, its ceiling, and the observable revisit trigger in session memory.

```bash
vendor/bin/agent-loop session record <task-id> \
  --kind decision \
  --title "Simplification ceiling: global lock" \
  --body "Current choice: one global lock. Ceiling: serializes independent accounts. Revisit when: measured lock contention materially affects request latency."
```

Triggers must be observable ("Revisit when latency > 200ms"), not speculative ("Revisit later if needed").

### Bad vs Good Progress Recording

### Bad
```bash
# Dumping whole terminal logs or vague unverified notes
vendor/bin/agent-loop session record TASK-1 --kind note --title "Tests" --body "$(cat /tmp/full-test-run.log)"
vendor/bin/agent-loop session checkpoint TASK-1 --title "Progress" --body "Done with some stuff, looks good."
```

### Good
```bash
# Exact commands, exit codes, and bounded decisions
vendor/bin/agent-loop session validation record TASK-1 \
  --contract-revision 1 \
  --command "vendor/bin/phpunit tests/Unit/ParserTest.php" \
  --status passed \
  --exit-code 0 \
  --by model-agent

vendor/bin/agent-loop session checkpoint TASK-1 \
  --title "Ready for review" \
  --body "Implementation complete; full diff inspected; required validation evidence recorded."
```

## Before Review & Close

Record the "Ready for review" checkpoint, then transition immediately to `agent-loop-review-close`. Do not duplicate review or close choreography here.
