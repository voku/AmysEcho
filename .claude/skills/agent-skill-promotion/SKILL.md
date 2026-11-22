---
name: agent-skill-promotion
description: Author a bounded UPDATE_SKILL or CREATE_SKILL consolidation result from validated voku/agent-learning evidence, then import it through the existing candidate-Proposal owner boundary without approving or applying guidance.
argument-hint: "[validated Finding ID ...]"
metadata:
  author: Lars Moelleken <lars@moelleken.org>
---

# Agent Skill Promotion

Use this skill when validated Learning evidence is already classified as `UPDATE_SKILL` or `CREATE_SKILL` and should become a reviewable skill proposal.

This skill is an agentic authoring layer over Learning's existing deterministic owners. It does not create a second promotion policy or lifecycle.

## Completion contract

A run is complete only when the authored consolidation result is accepted by:

```bash
vendor/bin/agent-learning proposal-import \
  --root <learning-root> \
  --input <consolidation-result.json>
```

and the owner returns a candidate Proposal ID.

Return exactly one terminal status:

```text
SKILL_PROMOTION_CANDIDATE <proposal-id> <target>
SKILL_PROMOTION_REDIRECT <owner-or-constraint-path> <reason>
SKILL_PROMOTION_BLOCKED <reason>
```

A candidate is ready for Proposal review. It is not approved or active guidance.

## 1. Prepare bounded Learning evidence

Start from explicit validated Finding IDs:

```bash
vendor/bin/agent-learning prepare \
  --root <learning-root> \
  --finding <finding-id> \
  [--finding <finding-id> ...] \
  --output <consolidation-input.md>
```

Use the generated consolidation input as the Learning-owned evidence envelope. Do not reconstruct Finding JSON, proposal history, or active guidance from private storage.

This skill handles only Findings whose current Learning classification is `UPDATE_SKILL` or `CREATE_SKILL`. If the prepared evidence is unclassified, classified differently, materially contradictory, or spans unrelated patterns, return `SKILL_PROMOTION_BLOCKED`. Do not change the classification silently.

Preserve the owner-backed:

- source Finding IDs;
- `pattern_key`;
- `validation_case`;
- source scope;
- rejected-guidance and outcome evidence when present;
- remaining uncertainty.

## 2. Prefer the existing semantic owner

Inspect only the smallest current skill/guidance set needed to test the proposed owner.

For `UPDATE_SKILL`, identify the existing skill that owns the behavior and the exact boundary being changed.

For `CREATE_SKILL`, preserve Learning's existing overlap gate. A new skill is justified only when no inspected skill already owns the behavior within the allowed overlap threshold.

Do not duplicate guidance whose correctness depends on another tool's CLI, schema, storage, generated artifacts, or lifecycle. That guidance belongs with the tool owner.

If the evidence instead supports an objectively detectable invariant better owned by a test, static rule, schema, type, or CI gate, return `SKILL_PROMOTION_REDIRECT`. Do not silently rewrite the Learning classification or activate a Constraint.

## 3. Define a discoverable skill boundary

For proposed skill wording, treat the frontmatter description as the discovery contract.

It should state:

- the distinctive capability or governing decision;
- the smallest discriminating intents, artifacts, or failure modes that make the skill relevant;
- an exclusion only when a competing workflow would otherwise be selected incorrectly.

Do not repeat a long trigger inventory in the body after discovery has already occurred.

## 4. Keep one coherent context boundary

The promoted guidance should own one coherent procedure or body of judgment.

Keep guidance together when its parts always trigger together and cannot be reused independently.

A separate skill boundary is justified when the behavior has a distinct trigger and can be reused or evolve independently. File length and topic adjacency are not evidence for another skill.

For `CREATE_SKILL`, reflect this reasoning in the overlap_check.decision field and the proposal boundary.

## 5. Use progressive disclosure

Keep the governing model and rules needed for every invocation in `SKILL.md`.

Move conditional, branch-specific, or example-heavy detail behind local rule/reference files only when it need not load on every invocation.

Each routed detail should be directly discoverable from the entry point, and its routing sentence should explain the decision or situation that makes it relevant. Prefer flat owned resources over documentation depth without separate ownership.

## 6. Author the existing consolidation-result contract

Write one temporary JSON result outside Learning-private proposal storage. Use only fields accepted by the existing consolidation-result validator.

For a skill proposal this normally includes:

```json
{
  "action": "ADD",
  "source_findings": ["finding...."],
  "reason": "...",
  "remaining_uncertainty": [],
  "learning_decision": "CREATE_SKILL",
  "pattern_key": "...",
  "validation_case": {
    "given": "...",
    "when": "...",
    "then": "..."
  },
  "target_type": "skill",
  "target": "...",
  "scope": ["..."],
  "old": "...",
  "new": "...",
  "boundary": "...",
  "validation": ["..."],
  "overlap_check": {
    "inspected": ["..."],
    "max_overlap_percent": 0,
    "decision": "..."
  }
}
```

Follow the owner rules rather than the example mechanically:

- `CREATE_SKILL` requires `ADD`, `target_type=skill`, and the validated overlap check.
- `UPDATE_SKILL` requires `target_type=skill`; choose `ADD`, `REPLACE`, or `DELETE` from the actual reviewed mutation.
- Do not supply Proposal lifecycle fields such as ID, status, timestamps, proposer, or approver.
- Do not widen scope beyond source evidence without an explicit justification supported by current evidence.
- Keep `new` wording limited to the promoted guidance. Do not smuggle unrelated cleanup into the proposal.

## 7. Import through the owner

Run:

```bash
vendor/bin/agent-learning proposal-import \
  --root <learning-root> \
  --input <consolidation-result.json>
```

The owner re-parses the result, validates Finding references and Learning semantics, generates the Proposal ID, validates the candidate Proposal, and writes it atomically under the Learning root.

If import fails, fix only author-owned result content when the error is genuinely an authoring defect. Do not edit `proposals/**` directly or weaken validation to make the candidate pass.

## Authority boundary

This skill must never:

- change a Finding classification silently;
- approve, apply, reject, retire, or acknowledge a Proposal;
- edit Learning-private Finding or Proposal files directly;
- mutate the target skill as if a candidate were already approved;
- create or activate Memory, Skill, or Constraint state;
- treat repeated wording as proof of reusable behavior.

Human/owner review remains the authority-bearing step after candidate import.
