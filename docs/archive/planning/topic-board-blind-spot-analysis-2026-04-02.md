# Topic Board Blind-Spot Analysis (2026-04-02)

## Question
Should TODO context move entirely into topic sub-files, and where should Kanban status live?

## Blind spots identified

1. **Dual-status drift risk**
   - If `todo.md` and `topics/*/topic.md` both act as writable status sources, they will diverge.
2. **Context fragmentation**
   - Moving all task context out of `todo.md` makes roadmap scanning slower and increases onboarding time.
3. **Completion evidence loss**
   - If done items are not mapped to topic boards, evidence quality varies across historical tasks.
4. **Inconsistent granularity**
   - Reused IDs (e.g., multiple APR-P0-2 outcomes) need explicit board IDs to avoid ambiguity.

## Decision
Use **hybrid governance**:

- **Single source of truth for active Kanban column/status:** `docs/planning/todo.md`
- **Single source of truth for completed items archive:** `docs/planning/todo-done.md`
- **Source of truth for details/evidence/next-step handoff:** `docs/planning/topics/<TOPIC-ID>/topic.md`
- Keep concise outcome + evidence summary in `todo.md` so roadmap review remains fast.
- Keep implementation details, checklists, and commands in topic files.

## Why this decision
- Preserves one authoritative status surface.
- Keeps roadmap readable for PM/release decisions.
- Gives contributors enough deep context to execute without bloating `todo.md`.

## Enforcement updates
- Every planned and completed roadmap task should include a `Topic board:` link.
- New board creation should start from `docs/planning/topics/_template/topic-template.md`.
- `todo.md` remains the planning index and status ledger.

- Completed tasks should be moved by cut/paste from `todo.md` to `todo-done.md` to keep one active board.

## Second pass (result-based blind-spot analysis)

Based on recovery output review, additional blind spots were identified:

1. **Legacy path visibility gap**
   - A legacy path can be included in discovery but contributors cannot see whether it contributed entries.
   - **Mitigation implemented:** recovery output now includes per-path recovered entry counts.

2. **History-depth ambiguity**
   - If local clone history is shallow, recovery may miss older done entries without obvious warning.
   - **Mitigation implemented:** script now scans all reachable commit trees and reports discovered TODO paths explicitly.

3. **Attribution confidence gap**
   - Recovered tasks need source-path + commit context to verify provenance quickly.
   - **Mitigation implemented:** each recovered line includes source TODO path and first-seen commit/subject.

4. **Operational drift risk**
   - If the script is not re-run, `todo-done.md` can diverge from git reality.
   - **Recommended next step:** add a lightweight CI check that runs the script and fails on dirty diff.
