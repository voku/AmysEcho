---
name: agent-learning-ctx-evidence
description: Use ctx-backed local agent-history search as bounded evidence references while creating, validating, or consolidating voku/agent-learning findings.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Learning ctx Evidence

Use this skill when creating, validating, or consolidating findings and prior agent sessions may contain relevant decisions, failed attempts, commands, review context, or validation history.

This skill depends conceptually on `ctx-agent-history-search`. Use that ctx skill for the detailed search workflow; use this skill to preserve the `agent-learning` boundary.

## Workflow

1. Check whether ctx is available and indexed:

```bash
ctx status
ctx sources
```

2. Search for focused historical context:

```bash
ctx search "<task / failure / module / command>"
```

3. Inspect before relying on a result:

```bash
ctx show event <ctx-event-id> --window 5
ctx locate event <ctx-event-id>
```

4. Create or update an agent-learning finding with `agent_history_reference` evidence.

## Evidence Rules

- Set `type` to `agent_history_reference`.
- Set `source` to `ctx`.
- Record `query`, `retrieved_at`, `summary`, and at least one of `ctx_session_id` or `ctx_event_id`.
- Use `verification_status=found` for search hits that were not opened.
- Use `verification_status=inspected` only after reviewing the event or session.
- Use `verification_status=rejected` for irrelevant or wrong hits.
- Use `verification_status=stale` for old context that may no longer apply.

Do not paste raw transcript text unless it was explicitly reviewed and is necessary. Do not store large JSON payloads, secrets, tokens, or private-path-heavy excerpts. Do not mark ctx-derived findings as validated without independent project evidence.

`ctx` helps find what happened before; `agent-learning` decides what deserves to survive.
