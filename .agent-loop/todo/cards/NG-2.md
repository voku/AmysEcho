# NG-2: Child profiles: isolated local storage with export, restore and delete

- **Ticket:** NG-2
- **Lane:** BACKLOG
- **Domain:** product
- **Created:** 2026-11-22T08:00:52+00:00
- **Updated:** 2026-11-22T11:35:15+00:00
- **Summary:** ProfileV1 from the product contract; each profile has its own concepts and later its own gesture examples.
- **Next:** Choose the smallest browser storage that passes isolation and round-trip tests; caregiver-only controls.
- **Validation:** npm ci --ignore-scripts && npm run verify
- **Priority:** 3
- **Wave:** Wave 1 - board (S1)
- **Format version:** 1

## Agent Task Brief
Goal: several children on one device without cross-reading state. ProfileV1 { version, id (opaque random), displayName, conceptIds } stored locally; versioned export -> restore -> delete round trip; malformed or incompatible imports rejected without partial changes; deleting a profile removes everything it owns and leaves other profiles intact. Storage: choose the smallest browser storage that passes the isolation and round-trip tests and record the choice in docs/storage.md, including what happens on eviction. No names or birth dates in ids. Scope: src/profiles/, test/, docs/storage.md. Depends on: NG-11. Issue 1180 (S1), product contract sections 3 and 6.
