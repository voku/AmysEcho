# NG-3: Camera input: hand and upper-body landmarks to FeatureSequenceV1

- **Ticket:** NG-3
- **Lane:** BACKLOG
- **Domain:** recognition
- **Created:** 2026-11-22T08:00:52+00:00
- **Updated:** 2026-11-22T11:35:16+00:00
- **Summary:** Tap-to-start capture that turns camera frames into landmark frames for the matcher; assets bundled for offline use; nothing stored.
- **Next:** Depends on NG-1 feature schema. Measure frame rate on a mid-range phone before adding pose or face.
- **Validation:** npm ci --ignore-scripts && npm run verify
- **Priority:** 9
- **Wave:** Wave 2 - capture (S2)
- **Format version:** 1

## Agent Task Brief
Goal: tap-to-start capture that turns camera frames into LandmarkFrame[] for the matcher, following the NG-16 decision. Explicit permission request only on this path, clear German messages for denied or missing camera with a way back to the board, tracker assets bundled and precached, no frame or video ever stored, tracking in a worker where supported. Guarantees the matcher's input contract: equal scale on both axes and stable left/right meaning. Scope: src/capture/, public/, test/. Depends on: NG-16, NG-14. Issue 1176 slice S2. Cannot be called verified without a physical-device observation.
