---
scope: llm-refactor-process
status: active
superseded_by: null
tracked_in: docs/planning/TODO.md
---
# Blind Spot Detector Report: LLM Advice for Architecture Refactors (2026-03-01)

This report is intentionally direct. It is meant to expose failure patterns in how architecture-refactor advice from LLMs is accepted or rejected.

## 1) Understand (The Core Loop - Expose the Pattern)

You keep acting like "good reasoning" from an LLM is evidence. It is not. It is theater until it survives constraints.

- You reward confident meta-talk ("I am good at architecture") and punish operational friction ("set up A/B checks, hard acceptance criteria, and rollback boundaries").
- You repeatedly skip forced proof loops because they are annoying and slow.
- You pretend "clarity in discussion" equals "clarity in implementation." That is intellectual laziness.

Underlying weakness: you want cognitive comfort more than empirical truth.

## 2) Explore (Future vs. Now - The Cost of Convenience)

Your current process optimizes for today’s emotional relief ("this explanation sounds right") and burns tomorrow’s delivery capacity.

- If you accept unproven architecture refactors, every future change inherits unmeasured coupling and hidden regressions.
- If you reject refactors based on vibes, you trap the codebase in legacy pain and call it "stability."
- In both cases, you avoid measurement and then act surprised when velocity collapses.

You are trading short-term certainty for long-term chaos, and calling that prudence.

## 3) Attempt (Find the Rotting Core)

The single rotting core: **you do not demand concrete A/B proof before accepting architecture advice.**

Run one uncomfortable test that removes all excuses:

1. Pick a real, non-trivial change request touching a cross-cutting concern.
2. Implement it twice on the same branch baseline:
   - Variant A: current architecture.
   - Variant B: proposed "clean" refactor boundaries.
3. Freeze acceptance criteria before coding:
   - identical behavior tests,
   - max touched files budget,
   - max total changed lines budget,
   - cycle-time budget,
   - rollback simplicity score.
4. Compare outputs blind to narrative. Keep whichever wins on measurable constraints.

If you resist this test, that resistance is your blind spot made visible.

## 4) Inspect (Challenge the Delusion)

The delusion you trust: "I can judge architecture quality from argument quality."

No. You are confusing rhetoric with system fitness.

- "Sounds principled" is not an engineering metric.
- "Feels cleaner" is not a maintainability measurement.
- "Model explained trade-offs well" is not proof that the trade-offs were executed safely.

You are lying to yourself whenever you treat conversational confidence as substitute for contract tests, boundary enforcement, and regression evidence.

## 5) Evolve (Force the Next Level)

Drop this belief immediately: **"If I understand the argument, I understand the risk."**

Replace it with a non-negotiable ritual:

> **No architecture refactor decision without a pre-registered proof protocol.**

Mandatory protocol for every LLM-driven architecture proposal:

1. Define enforceable boundaries in code terms (ownership, dependency direction, forbidden imports).
2. Define a measurable A/B change task before design discussion.
3. Define pass/fail gates (tests, diff budgets, latency/perf constraints, rollback path).
4. Execute both variants or reject the proposal as unverified.
5. Record decision with evidence links, not opinions.

If you skip this ritual, you are not doing architecture. You are doing ego management disguised as technical leadership.

---

## Self-Run Blind Spot Analysis (Agent) — Based on Current Repository Work

### 1) Understand (The Core Loop - Expose the Pattern)

My repeat failure pattern is procedural obedience without enough scope protection. I follow required steps, but I can still let automation side-effects bleed into unrelated files when I run heavy repository scripts early.

- I can mistake "checklist completed" for "risk controlled."
- I can over-trust tool defaults (`git add .` inside progress tooling) and under-enforce pre-commit file boundaries.
- I can optimize for throughput and miss that one noisy command can create high-cost cleanup work.

Underlying weakness: I sometimes prioritize momentum over containment.

### 2) Explore (Future vs. Now - The Cost of Convenience)

If this pattern continues, I will keep producing avoidable churn:

- Unrelated file changes can pollute PR history and make review trust worse.
- Repeated cleanup cycles waste time and increase the chance of accidental regression.
- "Fast progress updates" become misleading because they can include incidental artifacts.

Short-term speed becomes long-term drag.

### 3) Attempt (Find the Rotting Core)

The rotting core is weak **change-boundary enforcement** before progress commits.

One uncomfortable forcing test:

1. Before every `report_progress`, run a hard scope gate: `git diff --name-status <base>..HEAD` plus `git status --short`.
2. If any file is outside the intended scope, stop and revert before reporting progress.
3. Only proceed when changed paths exactly match the planned checklist.

If I skip this gate even once, my "minimal-change" claim is unproven.

### 4) Inspect (Challenge the Delusion)

The delusion: "Because I can recover mistakes quickly, the process is safe."

That is false confidence.

- Recovery does not erase review noise.
- Reversion after accidental commit is still avoidable process debt.
- A clean final diff does not justify a sloppy path to get there.

I am wrong whenever I treat post-hoc cleanup as equivalent to pre-commit discipline.

### 5) Evolve (Force the Next Level)

Belief to delete: **"If the final net diff is small, the execution quality was good enough."**

Replacement ritual (mandatory):

1. Define explicit file-scope boundaries before any command that can mutate tracked files.
2. Use targeted checks/tests for docs-only tasks; avoid broad scripts unless required.
3. Run a pre-progress scope audit before every `report_progress`.
4. Refuse to report progress until scope is clean and explain any blocked state clearly.
5. Keep evidence in-command outputs, not assumptions.

This is the only reliable way to align "minimal changes" with actual behavior.

### Real Work Addendum — Repository-Grounded Proof Card

To make this self-analysis concrete, the next architecture-refactor decision must be evaluated against a real cross-cutting hotspot that exists in this codebase now:

- `webapp/src/hooks/useApiConfig.tsx` owns account/session token lifecycle (storage + refresh).
- `webapp/src/hooks/useAppState.tsx` + `webapp/src/services/profileRegistry.ts` own active child profile scope (`profileId`).
- `webapp/src/context/SymbolStore.tsx` and `webapp/src/hooks/useTrainingUploader.ts` mix both concerns (auth retry + profile-scoped data sync/upload).

This is exactly where "clean architecture" arguments are most likely to sound convincing while hiding risk.

#### Pre-Registered A/B Task (must be frozen before coding)

**Task:** Improve shared auth-failure handling in profile-scoped sync/upload flows without collapsing the account-vs-profile boundary.

- **Variant A (current architecture):**
  Keep retry/error handling local in `SymbolStore` and `useTrainingUploader`; apply only minimal tactical fixes.
- **Variant B (proposed refactor):**
  Introduce one shared boundary utility for auth-failure retry policy; keep profile selection/state ownership where it currently lives.

#### Pass/Fail Gates (non-negotiable)

1. **Behavioral parity tests** (both variants must pass):
   - `npm test --prefix webapp -- src/context/SymbolStore.test.tsx`
   - `npm test --prefix webapp -- src/hooks/useTrainingUploader.test.tsx`
   - `npm test --prefix webapp -- src/hooks/useApiConfig.test.tsx`
   - `npm test --prefix webapp -- src/hooks/useAppState.test.tsx`
2. **Boundary gate:** no variant may move profile ownership out of `useAppState` / `profileRegistry`.
3. **Diff budget:** max 5 touched files, max 220 changed lines.
4. **Cycle-time budget:** implementation + verification <= 120 minutes per variant.
5. **Rollback gate:** revert by dropping one commit without data-migration steps.

#### Decision Rule

Choose the winner only by measured gates above. If neither variant passes all gates, reject both and keep baseline.

#### Evidence Log Template (required)

- Baseline commit:
- Variant A commit:
- Variant B commit:
- Test output links:
- Touched files count:
- Changed lines count:
- Cycle time:
- Rollback complexity note:
- Final decision:

#### Executed Run (2026-03-01, PR #1034 scope)

This section executes the protocol above against this PR context instead of leaving it as a prompt.

- **Baseline commit:** `1fc2d0a`
- **Requested cross-cutting task:** shared auth-failure handling across `SymbolStore` and `useTrainingUploader` without collapsing account-vs-profile boundaries (account = caregiver auth/session token lifecycle; profile = child `profileId` data scope for uploads/symbol state).

**Gate execution evidence**

1. Behavioral parity tests on baseline were executed and passed:
   - `npm test --prefix webapp -- src/context/SymbolStore.test.tsx` (8/8 passed)
   - `npm test --prefix webapp -- src/hooks/useTrainingUploader.test.tsx` (11/11 passed)
   - `npm test --prefix webapp -- src/hooks/useApiConfig.test.tsx` (31/31 passed)
   - `npm test --prefix webapp -- src/hooks/useAppState.test.tsx` (4/4 passed)
2. Scope gate for this issue: docs-only PR. Introducing Variant A/B code edits would violate the approved change boundary for this thread.
3. As a result, both architecture variants are blocked in this PR and cannot be claimed as verified outcomes here.

**Decision (executed, not hypothetical)**

- **Variant A commit:** none (blocked by issue scope gate)
- **Variant B commit:** none (blocked by issue scope gate)
- **Touched files count:** 1 (analysis document only)
- **Changed lines count:** docs-only
- **Cycle time:** bounded to PR-comment response window
- **Rollback complexity:** trivial (single documentation commit)
- **Final decision:** reject architecture refactor decision in this PR as **unverified in code**; require a dedicated follow-up PR that executes Variant A and Variant B implementations under the same frozen gates.

---

## Executed Follow-Up Run (2026-03-01, chat-driven “real video test”)

Per reviewer request, I executed a realistic repo-grounded training/evaluation cycle using all available DGS videos in the repository instead of prompt-only analysis.

### Dataset and preparation

- Source video corpus: `server/data/dgs_video_examples` (314 `.mp4` files).
- Isolated execution workspace: `/tmp/amys-echo-dgs-realtest` (to avoid PR noise/artifacts in the repository).
- Landmark extraction command path: `scripts/process_dgs_videos.py`.
- Training command paths:
  - `scripts/train_model.py`
  - `server/training/train_mlp.py`

### Executed runs and outcomes

1. **Landmark extraction (all repo videos)**
   - Input videos processed: **314**
   - Landmark files produced: **302**
   - Extracted landmark samples: **5073**

2. **Temporary model run #1 (`scripts/train_model.py`)**
   - Config: `epochs=300`, `learning_rate=0.01`, `augmentation_factor=1`, `window_size=5`
   - Result: **Top-1 accuracy 10.35%**

3. **Temporary model run #2 (`scripts/train_model.py`, increased timeout/epochs)**
   - Config: `epochs=1200`, `learning_rate=0.003`, `augmentation_factor=2`, `window_size=5`
   - Result: **Top-1 accuracy 10.35%** (no improvement vs run #1)

4. **Temporary model run #3 (`scripts/train_model.py`, balanced manifest cap)**
   - Config: balanced per-label manifest (max 6 files/label), `epochs=800`, `learning_rate=0.003`
   - Result: **Top-1 accuracy 3.32%** (regression vs run #1/#2)

5. **Temporary model run #4 (`server/training/train_mlp.py`, temporal pipeline)**
   - Config (env): `MLP_WINDOW_SIZE=5`, `MLP_EPOCHS=600`, `MLP_LEARNING_RATE=0.003`
   - Result:
     - **Training accuracy: 17.64%**
     - **Validation accuracy: 15.74%**

### Validation conclusion

- The “real work” execution request was fulfilled (full-video corpus ingestion, long-running training, explicit timeout patience, and measured evaluation).
- Results are currently **not yet usable for production detection quality**; additional targeted iteration is required.
  - Context: with 47 labels, random top-1 is ~2.13%, so 10.35%/15.74% is above random but still far below a practical deployment threshold (useful baseline target: >=60-70% top-1 on a fixed held-out set).
- Practical next loop should focus on:
  1. stricter label consistency and class-balance controls,
  2. modality-quality filtering before training,
  3. fixed hold-out protocol and repeated run tracking for comparable improvements.
