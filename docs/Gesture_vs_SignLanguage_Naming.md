# Gesture vs. Sign Language Naming Review

## Context
Recent fixes reduced UI churn in the sign-language detector by ignoring empty `gesture_batch` payloads in the web bridge (see `useSignLanguageDetector`). The broader stack already targets Deutsche Gebärdensprache (DGS) end to end, but many core classes, message types, and directories still carry the legacy "gesture" naming.

## Pros for renaming to "Sign Language"
- **Aligns with product scope**: The training and distribution roadmap is explicitly DGS-focused (capture → bundle → train → distribute), so naming the detector accordingly would match our documented mission and reduce ambiguity about which gestures we support.
- **Clarifies ML intent**: Types such as `GestureResult` and `DetailedGestureResult` describe DGS sign labels and thresholds. Renaming the surrounding detector would make it clearer that these "gestures" are linguistic signs, not generic hand motions.
- **Reduces caregiver confusion**: UI strings in training and Learning Hub screens already talk about "Gebärden" and sign capture; matching the detector name would keep terminology consistent across UX, docs, and code.
- **Supports variation learning story**: Services like the Sign Variation Tracker are explicitly about signing style, not general gestures. A sign-oriented detector name would emphasize that the pipeline learns sign variants rather than arbitrary motions.

## Cons / risks of renaming
- **Cross-platform coupling**: The `webapp/src/gesture/` directory is copied from the mobile webview. Renaming classes, folders, and message types would create divergence and require coordinated changes in the mobile app to keep the bridge events (`gesture`, `gesture_batch`, `landmarks`) compatible.
- **Widespread surface area**: Core orchestrators, message parsers, and telemetry rely on gesture-prefixed names (e.g., `GestureRecognitionOrchestrator`, `GestureDetectorConfig`, `GestureDetectionStep`). Renaming would touch a large portion of the pipeline and risks regressions if any event names or configuration keys are missed.
- **Emergency and fallback flows**: Components like the `EmergencyGestureSystem` and fallback detectors are tuned for quick hand signals beyond linguistic signs. A wholesale rename could blur the distinction between linguistic signing and utility gestures, making it harder to reason about these safety pathways.
- **API and data compatibility**: Bridge messages, persisted training bundles, and telemetry payloads currently serialize gesture-typed fields. Renaming would ripple into stored data, tests, and backend ingestion, requiring migration steps to avoid breaking historical bundles or logs.

## Recommendation
Keep the current "gesture" identifiers for low-level event types and cross-platform interfaces until we can coordinate a synchronized rename across mobile, web, and server transports. We can still use "sign language" naming in UI-facing hooks and higher-level documentation to reflect the DGS goal without risking transport breakage. When ready, stage the transport rename behind compatibility shims that preserve the existing bridge event names.
