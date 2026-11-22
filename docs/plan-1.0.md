# Plan to 1.0

The board under `.agent-loop/todo/cards/` is the source of truth for tasks. This page explains how
the cards hang together. Product scope and gates come from
[#1176](https://github.com/voku/AmysEcho/issues/1176).

Show the board with `vendor/bin/agent-loop board next-pull` (pull order) or
`vendor/bin/agent-loop board render`.

## Waves

| Wave | Outcome | Cards |
| --- | --- | --- |
| 0. Workflow | Tasks in this TypeScript repository run through agent-loop with one validation command and code facts | NG-11, NG-10 |
| 1. Board (S1) | Several children on one device can communicate from a board with no camera and no network | NG-2, NG-12, NG-13, NG-14, NG-15, NG-6, NG-7 |
| 2. Capture (S2) | The camera produces clean landmark frames, offline, and gestures are cut out of a capture | NG-16, NG-3, NG-17, NG-18 |
| 3. Teach and recognise (S3) | A carer teaches a gesture; the child uses it; the app confirms before it speaks | NG-19, NG-4, NG-20, NG-8, NG-5 |
| 4. Release (S5) | Accessible, resilient against data loss, hosted, and checked against the 1.0 definition | NG-21, NG-22, NG-23 |

## Order and dependencies

```text
NG-11 ─┬─ NG-2 ─┬─ NG-12 ─────────────────────────────┐
       │        ├─ NG-13 ──────────────┐               │
       │        └─ NG-19 ──────────────┤               │
       └─ NG-14 ─┐                     │               │
NG-16 ───────────┴─ NG-3 ─┬─ NG-17 ─ NG-18 ─ NG-4 ─ NG-20 ─┬─ NG-5 ─┐
                          │                                 └─ NG-21 ┤
NG-15 (any time)          └─ NG-8 item 1 needs NG-17                 │
NG-22 needs NG-2 and NG-19 ───────────────────────────────────────── NG-23
```

NG-10 waits for an agent-loop release and does not block product work. The small NG-8 items
(input validation) can be taken at any time.

## Gates that code cannot close

- **NG-7:** a caregiver chooses the real concepts, the supported devices, and the retention and
  consent rules.
- **NG-6:** a person runs the offline session on the target phone or tablet with the camera denied.
- **NG-5:** recognition is measured on one profile's own recordings, split by recording session,
  and the thresholds are agreed with the caregiver after the first baseline.

1.0 is not declared while any of these is open (NG-23).

## Rules for every card

- Run it as a governed task: `vendor/bin/agent-loop enter <card>` before edits and
  `vendor/bin/agent-loop finish <card>` after.
- Scope lists product files only. Board cards and other files under `.agent-loop/` do not belong in
  a Contract scope.
- Validation is the full chain from `AGENTS.md`.
- Recognition changes report numbers from the evaluation in `npm test`. Synthetic numbers are not
  accuracy claims.
- No child data in the repository, in CI or in logs.
