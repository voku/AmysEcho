---
name: agent-loop-workflow
description: Operate a governed agent-loop task end to end, including implementation requests, by routing through enter/finish and obeying the lifecycle kernel's structured next step instead of reproducing workflow policy in host prose.
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Loop Workflow

**Trigger Anchor:** Governed lifecycle execution -> route through `enter` and `finish`, obey canonical `next_action_kind` / `next_action`, present exact evidence for human decisions, never reproduce workflow state in chat.

## Ordinary Host Contract

Start or resume through the front door:
```bash
vendor/bin/agent-loop enter <task-id> --format=json
```

Obey `next_action_kind` / `next_action` from that result. `AGENTS.md` already defines how to treat each kind, so this skill does not restate it: a third copy of a rule the router and the result both carry is a second source of truth that can drift from its authority.

A task router may choose a specialist skill, never a lifecycle phase. Only the current result routes task start/progress, Recall or repair, Learning, review, and close.

### Human-decision recommendations

Every current `next_action_kind=decision_required` question now includes a separate
`human_decision.recommendation`. Treat its `suggested_choice`, `reason`, and
`evidence_keys` as **advice, never authorization**. Show the recommendation
alongside the exact approval subject and supported choices; do not execute
`approve`, `accept-risk`, review acknowledgement, supersession, or Learning
on its behalf. An `abstain` means the available evidence cannot support a
recommendation, not that the human gate can be skipped.

Without explicitly configured inference, recommendations are conservative
local rules. When a project explicitly sets
`interaction.decision_advice.mode=assist` with
`provider=system_one`, an endpoint, and
`data_classification=public_metadata`, the optional model can advise at
the existing human gate. `shadow` records its selected option without
changing the visible recommendation; `off` makes no network request.
The adapter receives **only counts and decision category**, never Contract
goals, paths, tasks, reviews, or private text. It does not know enough to
verify human approval. Provider failure falls back to deterministic advice.
Repository `init.json` is **not trusted operator consent**. Automated human-gate
provider calls additionally require the trusted launcher to set an exact
`AGENT_LOOP_DECISION_APPROVED_ENDPOINT`, and, if a token environment variable
is configured, an exact `AGENT_LOOP_DECISION_APPROVED_TOKEN_ENV`. Never
supply grants through repository-controlled files or load credentials solely
because `token_env` appears in a project configuration.

### Optional host-neutral specialist hint

After `enter`, only when specialist selection could materially change the first investigation, a developer may explicitly request read-only advice:

```bash
vendor/bin/agent-loop decision route --mode=assist --task-id=<task-id> --contract-revision=<approved-revision> --data-classification=public --public-state="<public-only short task summary>" --endpoint="https://<explicit trusted host>/v1/systemone" --token-env=DECISION_MODEL_TOKEN --format=json
```

`off` is the default and makes no network request. `rules` leaves existing host routing unchanged; `shadow` records an observed decision-model choice without surfacing it as a hint. Use only public task text, never automatically forward Contract, Session or Recall contents. A non-null `routing_hint` in `assist` is optional advisory input to the invoking host, not a command to call the specialist. The host retains final selection and must obey the unchanged `enter` result. If the provider abstains or fails, continue without a hint. Never interpret a routing receipt as approval, mutation authority, or lifecycle state.

## End-to-End Implementation Front Door

When this skill is invoked for an end-to-end implementation request, keep the request ergonomic without creating a second workflow:

- use a supplied stable task id with `enter`. When a developer explicitly requests new local implementation work and **no stable task id was supplied**, first resolve the intended local board; for multiple configured boards, do not silently choose the default when the requested board is different or ambiguous. Create a Kanban card through its owner using `vendor/bin/agent-loop board card create --generate-id --title "<descriptive task title>" --lane=<configured-lane> --format=json` and pass `--board=<configured-board-id>` when selecting a non-default board (also pass any status, brief, or other fields required by that board's configured creation lane). Use the returned `card` ID unchanged for `enter`, Contract, Run, and Session. Never calculate `highest number + 1` or invent `PREFIX-NUMBER` in a host; preserve IDs actually supplied by an external ticket authority. If no local board is configured, use the actual external task owner when available; otherwise stop and request a stable task ID or a configured board instead of inventing one;
- treat the user's request as intent to drive the governed task, not as authority to skip approval, verification, review, Learning, or any other gate the current result requires;
- do not predeclare a private sequence such as branch -> specs -> code -> PR -> merge; the current lifecycle result decides the next governed action;
- continue through `enter`, host work, and `finish` until the result reports completion or a real `decision_required` boundary.

This is the implementation front door. Do not add a parallel `implement` skill that copies the same lifecycle semantics.

## Ambiguous New Work Items

A newly created task/card already supplies durable identity; being new does **not** by itself require an interview. After entering through the normal front door, a task router may select the installed `requirements-interview` specialist only when the card plus the smallest relevant repository evidence still leaves consequential behavior, scope, constraints, edge cases, acceptance criteria, or compatibility decisions unresolved.

When that specialist is useful:

- ground the interview in the durable task/card and repository evidence before asking questions;
- ask only for unresolved decisions that can change implementation or verification;
- hand the resulting implementation-ready contract back to the normal workflow/Contract owner;
- skip the specialist when the task is already implementation-ready.

The specialist clarifies intent only. It must not claim or move the card, approve the Contract, mutate source, perform implementation, or invent lifecycle state. Selecting it is specialist routing, not a new lifecycle phase, and it does not replace deterministic repository evidence such as the bounded discovery work owned separately by `agent-map`.

When host-native mutation is complete, reconcile deterministic close-out through:
```bash
vendor/bin/agent-loop finish <task-id> --format=json
```

Then obey the returned `next_action_kind` / `next_action` until `none` / complete.

## Decision & Review Presentation

Before asking for any `decision_required` action, present the smallest complete developer-readable projection of the decision subject. When the owner result carries `human_decision.card`, that card **is** the decision card: present its content fields (title, subject, why now, may change, out of scope, proof, unknown, what it authorizes, choices) and keep commands, paths and identifiers verbatim. Its `language` is the language the card text is written in and `requested_language` is what the session or project asked for; when `unknown` says the text needs translating, translate only the prose. Do not write a second card of your own. Only when `card` is absent or `null`, compose one from the `human_decision` subject as described below. Use the task's configured `prompting.language` (or the host session language, see below) for your own explanatory prose. Read the normalized `prompting` projection from `agent-loop workflow context <task-id> --format=json` when needed; the default is `en`. Preserve exact source text, technical identifiers, paths, commands, citations, and machine-readable status tokens. For explanatory messages from pipeline Attention, translate the explanation for the developer while retaining the exact owner evidence.

Apply this contract only when the current owner result says `decision_required`. Follow `command`, `command_template`, and `host_work` without turning them into confirmation questions. Ordinary review acknowledgement and Learning disposition remain agent work unless the owner explicitly marks a human decision as required.

The message must make the human's choice clear:

**Approval briefing first, details second.** Before any approval question, give a short, plain-language decision card grounded in the current `human_decision` projection (prefer `human_decision.card`; this paragraph describes what to cover when you must compose the card yourself), not a generic progress summary. Cover: **what exact revision/digest is being approved and why now; what will be allowed to change; what remains explicitly out of scope; what proof exists versus what is unverified; what approving, requesting changes, or declining actually does**. For a revision, summarize changes relative to the last genuinely approved baseline when owner evidence provides one. If a required fact is unavailable, mark it unknown rather than inventing it. Never say tests passed when only a validation plan exists. Brevity removes filler, not conditions, unresolved risks or identity anchors.

Keep the card readable at a glance; offer the full typed Contract/review evidence immediately below it or through existing owner-backed links. If `control_plane_presentation.status=ready`, include its exact task URL as an optional rich view. If it is `unreachable` and a `start_command` exists, show that command as an explicit **manual** option; do not auto-start a service, assume a URL is live, or treat viewing the UI as approval. For `wrong_project`, `wrong_service`, `probe_failed`, or missing UI, retain the CLI/JSON evidence and do not fabricate a clickable task URL. Never replace an exact Contract or review record with a compressed paraphrase.

- Name the action and exact current subject from the owner projection, including the revision or digest where relevant.
- Explain what each available choice changes or authorizes and its practical consequences. List only choices supported by current owner state or the user's stated intent; never invent an owner action. If there is no supported alternative, say what decision is required without manufacturing one.
- Recommend an option only when verified evidence supports it. Label it as a recommendation and give the evidence-based reason. If the evidence does not support a preference, say that no option is recommended and name the unresolved fact or risk.
- Keep advice separate from authority. A recommendation, a native dialog's preselected choice, or silence is never approval. Do not run or record the decision until the human explicitly chooses. Host tool-permission prompts remain separate from workflow decisions.
- Make the same decision information visible in prose when the host has no blocking question dialog. A native dialog may render the choices, but it must not hide the subject, consequences, or recommendation rationale.

Apply these details to common decisions:

- **Contract Approval:** Show candidate Contract revision (goal, scope, non-goals, acceptance criteria, validation commands). Refresh context if needed via:
  ```bash
  vendor/bin/agent-loop workflow context <task-id> --format=json
  ```
  Explain that approval authorizes work only within the stated scope and leaves the non-goals excluded. Ask whether to approve this revision or provide changes; do not present approval as the assumed choice. Once approved, ordinary implementation, validation, review acknowledgement, Learning disposition, and closeout proceed without ceremonial re-approval.
- **Review Acknowledgement, when the owner requires a human decision:** Render the deterministic HTML review workbench or read the report:
  ```bash
  vendor/bin/agent-loop workflow review <task-id>
  ```
  Surface the HTML path, review SHA-256, status, and findings before filling the review `command_template`. Explain the acknowledgement's effect from current owner state; do not imply that acknowledgement waives findings or proves approval.
- **Contract Revision, Clarification, Risk Acceptance, or Pipeline Attention:** State the exact owner-reported change, missing information, risk, or blocker; identify the affected stage or constraint and what resolving it would allow. Keep material unknowns visible. Recommend a response only when evidence supports it, and never imply that resolving pipeline Attention approves a code change or accepts a separate risk.

## Prompt Controls & Reflection

- **Controls:** `checkpoint-autonomy` and `momentum` tune execution behavior without changing lifecycle authority.
- **Review Loop:** `RETURN_TO_REVIEW` routes identified review defects back through the lifecycle kernel.
- **Reflection:** Reflection is deliberately **not** another lifecycle phase. Use it only when additional scrutiny is useful:
  ```bash
  vendor/bin/agent-loop workflow reflect <task-id> --scope task
  vendor/bin/agent-loop workflow reflect <task-id> --scope project
  ```

### Outcome-aware next-step prompt

When an agent has evidence of completion, a stalled approach, or an inconclusive
investigation and would benefit from a fresh direction, optionally render:

```bash
vendor/bin/agent-loop prompt next-step
```

This is a context-light, Recall-owned recommendation primitive, not a new phase
or permission to execute a proposed follow-up. Unlike governed `workflow reflect`,
it does not assume `ready_to_close` or `complete`. The host must still re-ground
current authority and follow the canonical `enter`/`finish` result. Do not
automatically repeat it after every step or manufacture work on a clean stop.

## Reflection Eligibility and Post-completion Future Work

Reflection eligibility depends on its scope:

- `task` reflection is allowed at `ready_to_close` or `complete` to inspect the current task. If it returns `RETURN_TO_REVIEW`, resolve the concrete gap and return to the normal review flow.
- `project` reflection is allowed only after the current task is `complete`; it is blocked at `ready_to_close`.

Apply `future_work.mode` to post-completion project reflection exactly:

- `focus` — stop. Do not proactively search for adjacent future work.
- `discover` — run one bounded project reflection with `vendor/bin/agent-loop workflow reflect <task-id> --scope project`, report the strongest evidence-backed direction (or explicitly report that no worthwhile investment direction was found), and do not prepare or execute follow-up work.
- `invest` — run the same bounded project reflection. When it identifies an evidence-backed direction worth preparing, use the repository's existing task/Kanban owner to prepare at most `future_work.max_follow_up_slices` independent follow-up candidates. Take each candidate's identity from the owner, exactly as projected in `future_work.follow_up_task_identity` (`agent-loop board card create --generate-id ...`), and use the returned card ID unchanged as its task id; never pick "highest number + 1", which independent branches compute identically. Do not approve or execute them automatically.

Follow-up execution requires its own normal governance/approval.

## Durable Handoff

When preserving bounded conversation context for a future agent in a task/card:
```bash
vendor/bin/agent-loop workflow handoff <task-id> --context '<bounded handoff notes>'
```
This binds notes to the governed Run/Session and compiles Recall's `todo-card-handoff` recipe into `system.md`.

### Bad vs Good Workflow Execution

### Bad
```text
# Chat-based lifecycle invention: skipping enter/finish, fabricating approvals
"I'll skip agent-loop enter and just edit the code directly, then close the ticket."
```

### Good
```text
# Canonical lifecycle routing: enter -> host work -> finish -> complete
RESULT: Parser updated to handle multiline docblocks.
STATE: ready_to_close TASK-1 rev 1
NEXT: vendor/bin/agent-loop finish TASK-1 --format=json
```

## Progress Receipt

Report only verified state after meaningful progress:
```text
RESULT: <verified result>
STATE: <current persisted lifecycle state>
NEXT: <canonical next step or explicit human gate>
```
Derive `STATE` and `NEXT` directly from the structured lifecycle result, never from a remembered phase diagram.
