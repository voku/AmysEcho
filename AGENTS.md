<!-- agent-loop:project-instructions:begin -->
## agent-loop workflow router

Use `voku/agent-loop` for governed work; detailed procedures live in installed skills and CLI help. When setup is uncertain, run `vendor/bin/agent-loop init host-status --format=json` and obey `next_action_kind` / `next_action`; `runtime_boundary` grants no mutation authority. Troubleshoot with `vendor/bin/agent-loop init status` or `init sync-instructions`.

Before the CLI is runnable, do only reversible workspace bootstrap, not product edits, approvals, or owner artifacts. Missing dependencies or preferred tools alone are not terminal blockers.

For durable tasks, run `vendor/bin/agent-loop enter <task-id> --format=json` before edits and `vendor/bin/agent-loop finish <task-id> --format=json` after host work; follow each returned `next_action_kind` / `next_action` until `none` / complete. Execute `command`, fill evidence-backed `command_template`, perform `host_work`; only `decision_required` needs a genuine human-authority decision. Show the exact current decision subject: before asking, present every field of `human_decision.card`, keeping commands verbatim (translate its prose only when `language` differs from `requested_language`); never invent approval.

Commit messages:

- Before a developer-facing commit, inspect the staged change and the task or decision evidence.
- Write an accurate title and a grounded reason for the change, in the format the repository's commit convention requires. Do not invent intent, benefits or proof.
- If the reason stays unclear after bounded investigation, stop that commit and ask the developer one targeted question, even in autonomous mode.
- Reuse an earlier answer while it still applies. Do not answer for the developer or bypass a rejected hook; if the hook rule itself looks wrong, tell the developer instead.

Use skills for specialist work: a router may select a specialist but never a lifecycle phase. Only the current result routes task start/progress, Recall/L2, repair, Learning, review, or close. Do not pre-build Map/Search or invent Session/Recall state. Use ephemeral sessions for untracked exploration. Claim hooks, checks, CI, merges, and releases only with evidence.

### Agent Learning

This project uses `voku/agent-learning` for reviewable evidence and durable guidance.
- Durable findings, proposals, and LearningNotes live below `.agent-loop/learning/`.
- Record validated findings or LearningNotes using the canonical learning commands/skills (`agent-learning-consumer`, `agent-learning-note`).
- Never auto-promote unverified findings, raw LLM observations, or dream output into active guidance.
<!-- agent-loop:project-instructions:end -->

## Repository role

`voku/AmysEcho` is Amy's Echo NG: a local-first AAC web app (TypeScript, no framework, no bundler)
with a concept board and, later, per-child gesture input. Product scope and slice gates are owned by
issue #1176; `docs/s0a-product-contract-v0.1.md` holds the product, device and privacy contract.

Keep this section outside the managed router markers above.

## Rules for this repository

- The product is TypeScript in `src/`, static assets in `public/`, tests in `test/` (Node's test
  runner against the built `dist/`). PHP exists only as workflow tooling under `vendor/`.
- No runtime dependencies without a recorded reason. No backend, sync or training service.
- User-facing text is German. Code, comments and docs are English.
- Never commit or upload child data: no video, audio, landmark sequences, session sheets or
  identifying screenshots. Public fixtures are synthetic.
- Recognition work reports measured numbers from the evaluation harness. Do not lower a threshold
  to make a gate pass.
- The pre-NG code is on `main_old` and is reference only. Do not import or port it wholesale.
- Code facts for governed tasks come from a TypeScript map: `.agent-loop/init.json` declares
  `map.languages: ["typescript"]`, and `agent-loop enter` builds the map when a Contract names
  `.ts`, `.mjs` or other JavaScript files. This needs Node and `node_modules/typescript`, so run
  `npm ci --ignore-scripts` before `enter`; without them `enter` stops and says why. The map holds
  declarations only: no call relations, and no deterministic `agent-loop edit` for TypeScript. It
  is built from scoped files that already exist, so a Contract that names only new files gets no
  map; add an existing neighbour file to the scope when the task needs code facts.

## Validation

```sh
npm ci --ignore-scripts
npm run verify
```

`npm run verify` runs the type check, the build, the tests and the offline asset smoke check, in
that order, and is what CI runs. Every Contract, including a `quick` task, lists at least these two
commands as validation, in this order; a task may add more. Validation runs in an exported copy
without `node_modules`, so `npm ci --ignore-scripts` has to come first.

`npm test` fails when it finds no test file or when no test passes, and a test checks that every
board card with a Validation field names both commands; cards of the `human` domain are validated
by hand and are exempt.
