# NG-5: Private evaluation tool for real recordings, split by recording session

- **Ticket:** NG-5
- **Lane:** BACKLOG
- **Created:** 2026-11-22T08:00:52+00:00
- **Updated:** 2026-11-22T08:00:52+00:00
- **Summary:** A local command that scores the matcher on recordings kept outside the repository and prints top-1, top-3, unknown recall and false accepts per session.
- **Next:** Depends on NG-1 and an export format from NG-2/NG-4. Results must never be uploaded.
- **Validation:** npm ci --ignore-scripts && npm run typecheck && npm run build && npm test && npm run smoke:offline
- **Format version:** 1

## Agent Task Brief
Goal: an honest accuracy number for a child's own gestures, with train and test taken from different recording sessions. This is the 1.0 recognition gate; synthetic numbers do not replace it.
