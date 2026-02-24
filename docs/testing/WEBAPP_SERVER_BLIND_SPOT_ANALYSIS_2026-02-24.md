# Webapp + Server Blind-Spot Analysis (2026-02-24)

## Scope

This analysis cross-checks the end-to-end trained-label path used by live gesture recognition:

1. **Server source of truth** for trained labels (`/api/v1/dgs/trained-labels`).
2. **Webapp consumer path** (`SignLanguageRecorder`) that gates output and diagnostics.
3. Existing unit tests that verify normalization behavior.

## Files Reviewed

- `server/src/services/trainedLabelsService.ts`
- `server/src/server.ts`
- `server/test/trainedLabelsService.test.ts`
- `webapp/src/components/SignLanguageRecorder.tsx`
- `webapp/src/components/SignLanguageRecorder.test.tsx`

## What is already strong

- Server canonicalizes trained labels and strips trailing UUID suffixes before returning merged labels. This is explicitly implemented and tested.
- Webapp now applies defensive normalization before matching predicted gesture labels against trained labels.
- Both sides currently pass focused tests, so the reported mismatch (`trinken-<uuid>` vs `TRINKEN`) is covered.

## Blind spots identified

### 1) Contract duplication across layers (medium)

Both server and webapp now normalize/strip UUID suffixes independently. This is resilient today, but creates drift risk if regex or normalization rules diverge.

**Risk:** Future edits can make server and webapp disagree about what “the same label” means.

**Mitigation:** Declare a contract: `/trained-labels` must return canonical labels, and webapp should only do light defensive normalization (trim/case/whitespace), not business-rule parsing.

---

### 2) Over-normalization possibility in webapp (medium)

Webapp currently strips UUID-like suffixes from **detector output** as well as trained labels.

**Risk:** A genuinely distinct sign label that intentionally ends with a UUID-like token could be collapsed.

**Mitigation:** Restrict UUID stripping to server-provided trained labels, or guard it behind an explicit “generatedLabelSuffix” marker from backend metadata.

---

### 3) Missing cross-layer integration assertion (high)

There are strong unit tests in both codebases, but no single test that verifies server response + webapp matching semantics together for this label format.

**Risk:** Unit suites pass independently while integration breaks after a contract change.

**Mitigation:** Add an integration test that mocks the real `/trained-labels` response shape and validates recorder diagnostics state transition for `trinken-<uuid>` + `TRINKEN`.

---

### 4) Locale/canonicalization mismatch risk (medium)

Server dedup uses `toLocaleLowerCase("de-DE")`; webapp uses `toLowerCase()` after `NFKC`.

**Risk:** Rare locale-specific edge cases can dedupe differently between layers.

**Mitigation:** Align on one documented normalization algorithm in API contract tests.

---

### 5) Hidden fallback behavior can mask model state issues (medium)

Recorder can allow fallback output while profile model is not ready.

**Risk:** Users may interpret successful fallback recognition as profile-model success, masking personalization failures.

**Mitigation:** Keep explicit UI distinction and log telemetry event when fallback output is enabled for trained-sign decisions.

---

### 6) Diagnostic messaging can still be technically correct but user-confusing (medium)

Current diagnostics report “not in trained profile” on strict mismatch only.

**Risk:** For near-match situations (synonyms/variants), users may get a dead-end message without next best action.

**Mitigation:** Add closest-match hint (if available) or direct CTA: “Diese Variante unter derselben Grundgebärde speichern”.

---

### 7) Sparse observability for mismatch root cause in production (medium)

There is no structured mismatch reason surfaced to backend telemetry (e.g., profile model inactive, label mismatch, confidence gate).

**Risk:** Hard to diagnose real-world failures quickly.

**Mitigation:** Emit lightweight reason codes for recognition suppression paths.

---

### 8) Documentation drift risk (low)

Behavior now depends on normalization details spread across server and webapp code.

**Risk:** Future contributors miss one side and reintroduce regressions.

**Mitigation:** Add a short “label canonicalization contract” section to testing strategy or API docs.

## Immediate recommendations

1. Add one cross-layer integration test for UUID-suffixed trained labels.
2. Decide whether UUID stripping belongs only on server contract side.
3. Document canonical label contract in `docs/testing/TESTING_STRATEGY.md`.
4. Add reason-code telemetry for suppressed/blocked outputs.

## Validation commands used

- `npm test --prefix server -- trainedLabelsService.test.ts`
- `npm test --prefix webapp -- SignLanguageRecorder.test.tsx`
