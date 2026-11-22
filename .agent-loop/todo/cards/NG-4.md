# NG-4: Teach: a carer records gesture examples for a concept

- **Ticket:** NG-4
- **Lane:** BACKLOG
- **Domain:** product
- **Created:** 2026-11-22T08:00:52+00:00
- **Updated:** 2026-11-22T11:35:16+00:00
- **Summary:** A carer records three to five examples of a gesture for one concept of the active profile; the concept is usable at once, offline, without training.
- **Next:** Split from the recognise flow (NG-20). Build after capture, segmentation and example storage exist.
- **Validation:** npm ci --ignore-scripts && npm run verify
- **Priority:** 13
- **Wave:** Wave 3 - teach and recognise (S3)
- **Format version:** 1

## Agent Task Brief
Goal (teach half): in the caregiver area a carer picks a concept of the active profile and records three to five examples with clear German guidance and immediate feedback (hand not visible, too short, too different from the other examples). Examples can be listed, replayed as a simple hand animation and deleted one by one. A concept with examples is usable at once, offline, with no training step. Scope: src/teach/, src/capture/, test/. Depends on: NG-3, NG-13, NG-18, NG-19. Issue 1176 slice S3.
