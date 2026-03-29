---
name: mediapipe-tasks-vision-web
description: Implement and debug MediaPipe Tasks Vision gesture recognition in Amy's Echo webapp. Use when changing webcam capture, landmark extraction, gesture recognizer setup, model loading, runtime confidence logic, or detection diagnostics tied to MediaPipe behavior.
---

# MediaPipe Tasks Vision Web

Use this skill when a change touches gesture detection runtime behavior in the webapp.

## 1) Confirm the runtime surface

Inspect these files first:

- `webapp/src/gesture/core/GestureDetector.ts`
- `webapp/src/hooks/useSignLanguageDetector.ts`
- `webapp/src/gesture/installMlp.ts`
- `webapp/src/gesture/modelClient.ts`

## 2) Follow a deterministic debug sequence

1. Reproduce with fixture-based tests before camera-based manual testing.
2. Verify detector init order (resource loading, model path resolution, warmup).
3. Verify confidence threshold and abstention logic.
4. Verify fallback behavior when profile model is unavailable.
5. Verify diagnostics output stays actionable and German for user-facing text.

## 3) Apply MediaPipe-specific guardrails

- Keep frame processing latency predictable (avoid extra heavy sync work in hot loop).
- Preserve handedness/landmark shape contracts across transforms.
- When changing ROI/cropping behavior, capture before/after benchmark evidence.

## 4) Validate end-to-end behavior

- Run focused tests for touched detection files.
- Run `npm --prefix webapp run diagnose:fixtures`.
- Run `npm test --prefix webapp` for regression confidence.

## References

- Official library docs: `references/official-mediapipe-docs.md`
- Runtime troubleshooting flow: `references/runtime-troubleshooting.md`
