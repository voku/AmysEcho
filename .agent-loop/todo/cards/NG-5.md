# NG-5: Private evaluation tool for real recordings, split by recording session

- **Ticket:** NG-5
- **Lane:** BACKLOG
- **Domain:** recognition
- **Created:** 2026-11-22T08:00:52+00:00
- **Updated:** 2026-11-22T11:35:16+00:00
- **Summary:** A local command that scores the matcher on one profile's real recordings, split by recording session. This is the recognition gate for 1.0.
- **Next:** Depends on NG-1 and an export format from NG-2/NG-4. Results must never be uploaded.
- **Validation:** npm ci --ignore-scripts && npm run verify
- **Priority:** 16
- **Wave:** Wave 3 - teach and recognise (S3)
- **Format version:** 1

## Agent Task Brief
Goal: an honest accuracy number for one profile's own gestures. A local command reads a profile export kept outside the repository, uses examples from some recording sessions and attempts from later sessions, and prints top-1, top-3, wrong concept spoken, unknown rejected and unknown accepted, per session and overall, using evaluateBySession. Results are never uploaded or committed. This is the recognition gate for 1.0: the thresholds are agreed with the caregiver after the first baseline, not invented. Revisit the feature weights and limits with this data. Scope: scripts/, src/recognition/, docs/recognition.md. Depends on: NG-19, NG-20 (session tagging of examples and attempts).
