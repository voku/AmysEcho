# NG-2: Child profiles: isolated local storage with export, restore and delete

- **Ticket:** NG-2
- **Lane:** BACKLOG
- **Created:** 2026-11-22T08:00:52+00:00
- **Updated:** 2026-11-22T08:00:52+00:00
- **Summary:** ProfileV1 from the product contract; each profile has its own concepts and later its own gesture examples.
- **Next:** Choose the smallest browser storage that passes isolation and round-trip tests; caregiver-only controls.
- **Validation:** npm ci --ignore-scripts && npm run typecheck && npm run build && npm test && npm run smoke:offline
- **Format version:** 1

## Agent Task Brief
Goal: several children on one device without cross-reading state; versioned export -> restore -> delete round trip; malformed imports rejected without partial changes. Issue #1180 (S1).
