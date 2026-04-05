# Topic Boards Index

This folder contains one subdirectory per active TODO topic. Each topic tracks:
- Scope and Amy impact
- Current status (Backlog / Ready / In Progress / Blocked / Done)
- Evidence links
- Next concrete command for handoff

Use `docs/planning/topics/_template/` when adding new topics.

## Governance model

- `docs/planning/todo.md` is the **single source of truth** for roadmap status (Kanban column/state).
- `docs/planning/topics/<TOPIC-ID>/topic.md` stores execution detail, checklist, and handoff commands.
- Keep summaries in `todo.md`; keep deep context in topic files.

- Completed tasks are archived in `docs/planning/todo-done.md` with the same monthly structure.
