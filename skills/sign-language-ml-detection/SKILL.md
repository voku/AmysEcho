---
name: sign-language-ml-detection
description: Diagnose and improve Amy's Echo web sign-language ML detection quality. Use when working on MediaPipe landmarks, MLP inference thresholds, confidence/margin behavior, detector telemetry, fixture diagnostics, or profile-aware recognition regressions.
---

# Sign Language ML Detection

Use this workflow for webapp gesture recognition and ML decision-path changes.

## 1) Map the touched detection path

Prioritize these components:

- runtime detector and processing: `webapp/src/gesture/core/`, `webapp/src/hooks/useSignLanguageDetector.ts`
- model load/inference: `webapp/src/gesture/installMlp.ts`, `webapp/src/gesture/modelClient.ts`
- diagnostics and fixtures: `webapp/src/gesture/testing/fixtures/`, `npm run diagnose:fixtures`
- training-to-runtime contracts: shared frame/label types and server model version endpoints

## 2) Reproduce with deterministic fixtures first

1. Run focused tests for the changed detection module.
2. Run `npm run diagnose:fixtures --prefix webapp` to generate comparison evidence.
3. Validate confidence and margin behavior with fixture outputs before manual camera runs.

Use the checklist in `references/detection-debug-checklist.md`.

## 3) Protect profile-aware behavior

Always verify account/session and active profile context are both valid when detection depends on profile-trained labels.

Do not report success if:

- profile-specific model failed to load,
- server rejected auth/profile-scoped requests,
- fallback path masked regression without telemetry.

## 4) Validate user-visible reliability

- Keep caregiver/child-facing copy in German.
- Prefer abstention on low confidence over forced wrong class.
- Confirm diagnostics explain why a trained sign was not accepted.

## 5) Report ML evidence clearly

Include:

- threshold/margin values used,
- top1/top2/margin effects,
- fixture report path,
- tests executed and outcomes.

## References

- Debug checklist: `references/detection-debug-checklist.md`
- Detection test matrix: `references/detection-test-matrix.md`
