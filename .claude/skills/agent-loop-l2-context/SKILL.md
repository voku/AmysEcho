---
name: agent-loop-l2-context
description: Use agent-loop to compile, inspect, and govern task-scoped Recall/L2 context without duplicating agent-recall-compiler's prompt schema or treating generated artifacts as executed work.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Loop L2 Context

**Trigger Anchor:** Compiling, inspecting, or governing task-scoped Recall/L2 context -> use `agent-loop` wrappers, respect `agent-recall-compiler` ownership, and never duplicate prompt schemas or treat generated artifacts as executed work.

## Ownership Boundary

- **`agent-loop` owns:** Orchestrating Recall runs, exposing task artifacts, governing the L2 execution contract gate, and routing reviews/outcomes.
- **`agent-recall-compiler` owns:** Compilation schema, operating-prompt manifests (`operating-prompts.json`), and L2 -> L1 prompt semantics (`agent-recall-consumer` skill).

## Context Orchestration Commands

| Phase / Purpose | Command Template | Output / Invariant |
|---|---|---|
| Read Bounded Context | `vendor/bin/agent-loop workflow context <task-id> --max-lines 120 --max-bytes 12000` | Read-only; does not recompile Recall or refresh map |
| Standalone Compile | `vendor/bin/agent-loop recall compile --task <task-id> --file <f1> --file <f2>` | Generates `system.md`, `facts.json`, `recall.bundle.json` |
| Plan with L2 Recipe | `vendor/bin/agent-loop workflow plan <task-id> --by <actor> --file <f1> --goal '<goal>' --validation '<cmd>' --operating-prompt-manifest vendor/voku/agent-recall-compiler/resources/skills/agent-recall-consumer/operating-prompts.json --operating-prompt '{"id":"<recipe>","arguments":{}}'` | References Recall's canonical manifest |
| Persist Governed Contract | `vendor/bin/agent-loop workflow contract <task-id> --status ready --from <l1.md> --by <actor>` | Transitions status to ready for implementation |
| Exact-symbol Architecture Intent | `<itp-path>/itp-context-summarize <file>` | After repository-appropriate navigation identifies an annotated edit target, summarize it before the first edit |
| Concept Architecture Search | `<itp-path>/itp-context-query var/itp-context --text='<concepts>'` | Search exported architecture intent when the relevant symbol is not yet known |
| PHPStan Repair Context | Repository PHPStan command (for example `composer phpstan`) | PHPStan diagnostics; configured Agent Format + ITP integration can add advisory ITP notices for diagnosed annotated files |
| Scoped Method Edit | `vendor/bin/agent-loop edit '<Class>::<method>' --runner=auto --replace-old='<old>' --replace-new='<new>' -- '<purpose>'` | Deterministic mechanical edit |

Use the repository-appropriate navigation method to identify the likely source
target; use Map when structural navigation adds value. Before proposing the
first edit to a target with a relevant `#[Rule]`, run
`itp-context-summarize <file>` and read its references/change guidance. Do not
summarize the whole repository or add an annotation only to populate context.
No ITP result means that target has no declared rule; it does not prove the
code has no architectural constraints. These rules are advisory context, not
approval or correctness evidence.

Use the repository's PHPStan command for later repair feedback. A PHPStan run
without Agent Format + ITP integration does not emit ITP notices. When the
repository configures Agent Format with ITP integration, a diagnosed annotated
file can add advisory ITP notices. Even then, a green run emits no ITP notice
and does not replace the pre-edit symbol summary.

### Bad vs Good Context Construction

### Bad
```bash
# Duplicating Recall schemas or hand-editing generated artifacts
vim .agent-loop/recall/TASK-1/facts.json
# Bypassing the contract gate and implementing without ready state
```

### Good
```bash
# Governed contract compilation and persistence
vendor/bin/agent-loop workflow context TASK-1 --max-lines 120 --max-bytes 12000
vendor/bin/agent-loop workflow contract TASK-1 \
  --status ready \
  --from .agent-loop/recall/TASK-1/contract.md \
  --by model-agent
```

## Review and Outcome Flow

1. **Review:** `vendor/bin/agent-loop review code <task-id>` followed by `vendor/bin/agent-loop review blindspots <task-id>`.
2. **Outcome:** Append truthful execution record (selected guidance != useful guidance):
   ```bash
   vendor/bin/agent-loop recall log-outcome \
     --draft <recall-root>/<task-id>/recall-log.draft.json \
     --by <actor> \
     --commit <sha>
   ```
3. **Verify:** `vendor/bin/agent-loop verify --task-id=<task-id>` before close.
