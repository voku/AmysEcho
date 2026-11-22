# NG-1: Recognition core: versioned feature sequences, DTW matcher with unknown result, synthetic evaluation gate

- **Ticket:** NG-1
- **Lane:** VERIFY
- **Created:** 2026-11-22T08:00:51+00:00
- **Updated:** 2026-11-22T08:25:44+00:00
- **Summary:** Pure TypeScript library, no camera and no UI. Per-profile nearest-example matching that can answer unknown.
- **Next:** Implement src/recognition/*, a seeded synthetic gesture generator for tests, and an evaluation test that reports top-1, top-3 and false-accept rate.
- **Validation:** npm ci --ignore-scripts && npm run typecheck && npm run build && npm test && npm run smoke:offline
- **Format version:** 1

## Agent Task Brief
Goal: a child profile's recorded examples can be matched against a new sequence, with unknown as a first-class result. Scope: src/recognition/, test/. Evidence: evaluation numbers printed by npm test on synthetic fixtures split by simulated session. Out of scope: camera, MediaPipe, UI, storage. Issue #1176 slice S3 (matcher only).
