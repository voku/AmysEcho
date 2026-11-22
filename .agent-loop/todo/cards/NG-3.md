# NG-3: Camera input: hand and upper-body landmarks to FeatureSequenceV1

- **Ticket:** NG-3
- **Lane:** BACKLOG
- **Created:** 2026-11-22T08:00:52+00:00
- **Updated:** 2026-11-22T08:00:52+00:00
- **Summary:** Tap-to-start capture, MediaPipe hand landmarks (worker where supported), no frame persistence, all model assets bundled for offline use.
- **Next:** Depends on NG-1 feature schema. Measure frame rate on a mid-range phone before adding pose or face.
- **Validation:** npm ci --ignore-scripts && npm run typecheck && npm run build && npm test && npm run smoke:offline
- **Format version:** 1

## Agent Task Brief
Goal: deterministic landmark-to-feature pipeline with replay fixtures; camera denial and failure recovery; network not used after install. Issue #1176 slice S2. Needs a physical-device observation before it can close.
