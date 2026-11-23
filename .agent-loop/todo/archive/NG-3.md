# NG-3: Camera input: hand and upper-body landmarks to FeatureSequenceV1

- **Ticket:** NG-3
- **Lane:** VERIFY
- **Domain:** recognition
- **Created:** 2026-11-22T08:00:52+00:00
- **Updated:** 2026-11-23T09:58:03+00:00
- **Summary:** Tap-to-start capture that turns camera frames into landmark frames for the matcher; assets bundled for offline use; nothing stored.
- **Next:** Depends on NG-1 feature schema. Measure frame rate on a mid-range phone before adding pose or face.
- **Validation:** npm ci --ignore-scripts && npm run verify
- **Priority:** 9
- **Wave:** Wave 2 - capture (S2)
- **Format version:** 1

## Handoff / Context
From the NG-16 reviews (docs/tracker-decision.md is the decision): keep the 25 MB tracker files in their own cache, filled and verified separately, so a failed download never breaks the board install (the record's line 68 says precache; plan step 4 is right). Add a CI check that the vendored bundle contains no network calls or external hosts; the worker is not covered by the meta-tag CSP. Call navigator.storage.persist(). Name who re-checks the pinned 0.10.35 and when. Shoulder visibility from the pose model is not a reliable filter. Camera only behind a tap, never on the board path; nothing stored. Phone probe first: stop and reconsider if hands-only tracking is too slow, hot or battery-hungry. Any real recording stays on the device and is never committed. Mind a caregiver's hands in the frame.

## Agent Task Brief
Goal: tap-to-start capture that turns camera frames into LandmarkFrame[] for the matcher, following the NG-16 decision. Explicit permission request only on this path, clear German messages for denied or missing camera with a way back to the board, tracker assets bundled and precached, no frame or video ever stored, tracking in a worker where supported. Guarantees the matcher's input contract: equal scale on both axes and stable left/right meaning. Scope: src/capture/, public/, test/. Depends on: NG-16, NG-14. Issue 1176 slice S2. Cannot be called verified without a physical-device observation. OWNER REQUIREMENT 2026-11-22 (Lars Moelleken): after the open UI tasks are done, gesture recognition must work properly with one hand and with two hands. Treat both as first-class: the tracker choice, capture, segmentation, features, teaching and the evaluation must each be shown to work for one-handed and for two-handed gestures, including a hand that leaves or enters the frame and the hands swapping sides; report measured numbers for both groups separately and never tune a threshold to pass.
