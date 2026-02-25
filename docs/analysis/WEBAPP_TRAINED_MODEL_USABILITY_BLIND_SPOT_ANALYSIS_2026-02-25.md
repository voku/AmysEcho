# Webapp Trained-Model Usability: Commit-Window Blind-Spot Analysis (2026-02-25)

## Scope and method
- Reviewed the latest 10 `git log --oneline` entries and analyzed the 7 non-merge commits that changed trained-model usability behavior.
- Focused on the path: **download/inject model -> runtime arbitration -> recorder output visibility -> caregiver trust**.
- Commit window analyzed:
  - `ecca4b9`, `7cfa790`, `4c8e2ef`, `61ddb67`, `571c4b2`, `3a56640`, `863cf90`.

## Code hotspots directly related to "make trained model usable in webapp"

### Primary runtime UX + output gating
- `webapp/src/components/SignLanguageRecorder.tsx`
- `webapp/src/components/SignLanguageRecorder.test.tsx`

Why it matters:
- This is now the main UI decision layer for whether MLP suggestions are visible, selectable, suppressed, or promoted to output.
- Most recent fixes (best-match panel behavior, manual selection gating, low-confidence display handling) land here.

### Recognition arbitration + threshold behavior
- `webapp/src/gesture/core/ProcessingSteps.ts`
- `webapp/src/gesture/core/GestureDetectionStep.test.ts`
- `webapp/src/gesture/utils/ProcessingPipeline.ts`

Why it matters:
- These files decide when MLP can beat/augment baseline output and how low-confidence candidates are surfaced.
- Relaxed-threshold constants and label normalization order were adjusted here.

### Model install + version visibility path
- `webapp/src/gesture/installMlp.ts`
- `webapp/src/components/Settings.tsx`
- `webapp/src/components/Settings.test.tsx`
- `webapp/vite.config.ts`

Why it matters:
- Commit hash visibility and install metadata improve diagnosability of "is the right model/version actually running?".

## What changed (signal from commit trend)
1. **UI now surfaces MLP alternatives more aggressively** (including lower-confidence candidates) to reduce silent "no output" moments.
2. **Recorder suppression logic was tightened** to avoid contradictory states where candidates are shown but still blocked in unclear ways.
3. **Manual suggestion selection logic was hardened** so user-driven choices respect trained-label and gating expectations.
4. **Label normalization order was corrected** and relaxed-threshold constants extracted, reducing accidental mismatches.
5. **Version/debug visibility improved** via commit hash surfacing, which supports field triage.

---

## Blind-spot analysis (system-level, based on this commit window)

### P0 blind spots
1. **Heuristic drift between UI gating and core pipeline arbitration**
   - Risk: `SignLanguageRecorder` and `ProcessingSteps` each carry parts of decision logic.
   - Failure mode: user sees candidate panel behavior that does not match final emitted sign logic.
   - Suggested mitigation: create one shared decision contract object (`reason`, `thresholdUsed`, `trainedLabelAllowed`, `manualOverrideApplied`) emitted by core and rendered by recorder.

2. **Confidence-threshold regressions are likely under realistic child movement/noise**
   - Risk: recent commits intentionally relaxed behavior; this can increase false positives if camera quality degrades.
   - Failure mode: "more usable" in lab -> noisier outputs in household lighting/device variability.
   - Suggested mitigation: add replay-based regression tests using recorded low-light/jitter fixtures and assert false-positive ceiling.

3. **Normalization is still a cross-boundary contract risk**
   - Risk: normalization was fixed in ordering, but multiple producers still exist (trainer artifacts, trained-label API, runtime labels, manual UI select).
   - Failure mode: valid trained sign appears "not trainiert" or gets filtered after manual choice.
   - Suggested mitigation: publish a single canonical normalization spec + fixture corpus shared by server/webapp tests.

### P1 blind spots
4. **Best-match visibility may mask missing profile-context truth**
   - Risk: UI can look improved while profile-specific model is absent and global fallback dominates.
   - Failure mode: caregiver assumes personalization works because suggestions appear.
   - Suggested mitigation: show explicit runtime badge: `Profilmodell aktiv` vs `Globales Fallback aktiv` next to best matches.

5. **Manual suggestion selection can hide root-cause diagnostics**
   - Risk: manual override helps communication (good), but can conceal that automatic ranking is wrong.
   - Failure mode: operationally looks healthy while model quality stagnates.
   - Suggested mitigation: log a counter for manual-overrides-per-session and expose it in diagnostics as a quality signal.

6. **Commit hash visibility is useful but insufficient for model provenance**
   - Risk: app version != model version.
   - Failure mode: team confirms correct build hash while stale model artifact is loaded.
   - Suggested mitigation: show model metadata tuple in UI diagnostics (`modelVersion`, `trainedAt`, `profileId`, `labelCount`, `artifactHash`).

### P2 blind spots
7. **UX improvements are concentrated in recorder screen tests**
   - Risk: integration path (`train -> distribute -> inject -> runtime`) may still have edge-case drift unobserved by component tests.
   - Suggested mitigation: add one end-to-end integration check that validates a known trained label reaches visible recorder output after model refresh.

---

## Self blind-spot analysis (agent-level)
Potential blind spots in **my own** review process for this commit window:

1. I can over-trust passing component tests and miss cross-module inconsistencies between `SignLanguageRecorder` and pipeline internals.
2. I can infer model usability from UI behavior without proving profile-model provenance at runtime.
3. I can underweight non-happy-path scenarios (stale trained labels cache, profile switch races, degraded camera confidence).
4. I can focus on code deltas and miss operational observability gaps (missing reason codes, missing model metadata in diagnostics).

Mitigations I should apply next time:
- Always pair UI-level assertion with core decision-reason assertion.
- Verify both build version **and** model provenance metadata before concluding "fixed".
- Run at least one negative-path scenario per identity boundary: expired auth, missing profile model, stale label cache.
- Prefer adding contract tests that pin shared normalization + arbitration behavior across modules.

## Recommended next actions (small, high-yield)
1. Add a single shared `recognitionDecision` payload from pipeline to recorder (with machine-readable reason codes).
2. Add a runtime diagnostics line for active model provenance (not only app commit hash).
3. Add integration test for `manual override` vs `automatic emission` consistency under low-confidence MLP output.
4. Add fixture-based normalization contract tests reused by server and webapp.
