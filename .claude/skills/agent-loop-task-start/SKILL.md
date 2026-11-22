---
name: agent-loop-task-start
description: Define durable task intent for a governed agent-loop task, then route startup through the lifecycle kernel instead of reproducing preparation or discovery choreography in host guidance.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Loop Task Start

**Trigger Anchor:** Starting a task or defining durable Contract intent -> recover reversible bootstrap, route through `enter`, define durable scope and validation, obtain named human approval before mutating code.

## Pre-Lifecycle Workspace Bootstrap

A fresh or isolated coding host may receive a checkout that cannot yet execute the repository's declared workflow. Restore only the minimum reversible environment needed to make that workflow runnable before interpreting its absence as a workflow failure. Typical bootstrap work includes inspecting the current worktree/remotes, fetching or reconstructing the obvious public repository remote, installing already-declared Composer dependencies, obtaining required public sibling checkouts for cross-package work, discovering available host/GitHub capabilities without printing credentials, and establishing an isolated branch or worktree before implementation.

This bootstrap is outside the governed product-mutation boundary: it does not create or approve a Contract, Session, Recall, Finding, proposal, or other owner state, and it does not authorize product-code changes. Once the lifecycle CLI is runnable and an isolated implementation workspace exists, return immediately to the governed front door below.

Do not declare a task blocked merely because `vendor/`, an expected public remote, `gh`, push credentials, or one preferred PR helper is missing. Recover safe local bootstrap first. If remote mutation remains unavailable, continue all useful local inspection, implementation, validation, commits, and dogfood preparation that current authority permits.

## Start Through The Front Door

Start or resume with:
```bash
vendor/bin/agent-loop enter <task-id> --format=json
```

For a new task, the kernel returns a `command_template` PLAN command. Fill missing Contract inputs from the request and repository evidence, execute without extra human confirmation, then call `enter` again and obey the structured `next_action_kind` / `next_action`.

Approval records authority for the exact Contract revision; Run, Session and Recall preparation happens deterministically behind `enter`. Never fabricate an approval actor or self-approve.

## Contract Intent & Scope

A PLAN must carry enough durable intent that future agents do not need the chat context:
- **Task ID:** Reuse a supplied stable external identifier (e.g. `ISSUE-123`). For an explicitly requested new local card without one, follow `agent-loop-workflow` to obtain the Kanban owner's generated card ID and reuse it unchanged. Never derive an ID by incrementing a branch-local maximum.
- **Scope (`--file` / `--scope`):** Smallest stable boundary containing the change (single file or cohesive component directory plus tests; never the entire repo root).
For a required **scope-only** expansion after approval, batch paths with
`workflow plan TASK --by ACTOR --supersede --add-scope PATH` (repeat
`--add-scope` for each path). This preserves the Goal, validation,
acceptance and other Contract intent, but creates an unapproved revision and
retires any active working Session. Present the revised scope for named human
approval before resuming. Never exempt scripts, documentation or tests from
scope authority automatically.

- **Validation (`--validation`):** Real executable command (`composer ci` or focused test), one command per flag. `finish` needs passing evidence for each entry on its own, so a `;`, `&&` or `||` chain is a single all-or-nothing obligation that tends to fail late and force a new Contract revision with a new approval; `workflow plan` warns about it.
- **Acceptance:** Specific outcome criteria that must hold.

### Bad vs Good Contract Plan

### Bad
```bash
# Vague placeholders, repository-wide scope, unexecutable validation
vendor/bin/agent-loop workflow plan TASK-1 --by model --file . --goal "<goal>" --validation "make sure tests pass"
```

### Good
```bash
# Focused file owners, explicit goal, executable test gate
vendor/bin/agent-loop workflow plan TASK-1 \
  --by model-agent \
  --file src/Parser.php \
  --file tests/ParserTest.php \
  --goal "Fix handling of multiline docblocks in Parser" \
  --validation "vendor/bin/phpunit tests/ParserTest.php"
```

## Existing Work Preflight

Inspect overlap before invention. For non-trivial work, inspect bounded relevant current/recent work when the host can do so cheaply. An open PR is not correctness evidence. Classify useful candidates as landed, active, superseded, abandoned, or independent, then try to **falsify it** against current task intent before creating a competing implementation.

When evidence shows an existing candidate already owns the same change, close superseded work instead of creating a competing implementation. If external history is unavailable, continue from current repository evidence and state the limitation.

Do not turn this preflight into a new lifecycle state. It informs Contract intent; the lifecycle kernel still owns what happens next.

## External Reference Preflight

Use this preflight **only** when the task is explicitly defined relative to an upstream implementation, specification, prior version, or other external authority. Before running `workflow plan` or sealing scope for approval:
- state what is included, excluded, and still unknown;
- distinguish a direct port from an adaptation (`adapt upstream checks` must not silently become `port upstream checks wholesale`);
- do not claim parity from a partial inventory;
- intentionally scope to one rule or behavior when reference is too broad;
- record that surface as unknown if evidence cannot establish it.

This is evidence for choosing Contract intent, not a new lifecycle state. Do not turn it into a parallel discovery workflow.

## Operating Prompts

Recall owns the recipe semantics. Do not restate RED/GREEN/REFACTOR here; the selected Recall recipe owns those constraints.

- For behavior-changing work with a meaningful automated test seam, select `test-driven-development` using the Recall-owned manifest:
  ```bash
  vendor/bin/agent-loop workflow plan <task-id> \
    --by <actor> \
    --file <path> \
    --goal <goal> \
    --validation <validation> \
    --operating-prompt-manifest vendor/voku/agent-recall-compiler/resources/skills/agent-recall-consumer/operating-prompts.json \
    --operating-prompt '{"id":"test-driven-development","arguments":{}}'
  ```
- For a specific bug claim that first needs proof, select `reproduce-before-fix`. Do not stack both recipes.

## After PLAN

Return to:
```bash
vendor/bin/agent-loop enter <task-id> --format=json
```
Obey the canonical next step from `next_action`. Lower-level tools (`map`, `session`, `recall`) are diagnostics/recovery tools, not mandatory startup choreography.
