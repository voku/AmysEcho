# NG-8: Recognition hardening from the NG-1 reviews

- **Ticket:** NG-8
- **Lane:** BACKLOG
- **Domain:** recognition
- **Created:** 2026-11-22T08:25:44+00:00
- **Updated:** 2026-11-22T11:35:16+00:00
- **Summary:** Remaining hardening items from the NG-1 reviews: look-alike rejection, anchor policy, input validation, one-handed profiles.
- **Next:** Take items 3, 4, 5 and 7 as a first small task; item 1 needs measurement on replay fixtures (NG-17).
- **Validation:** npm ci --ignore-scripts && npm run verify
- **Priority:** 15
- **Wave:** Wave 3 - teach and recognise (S3)
- **Format version:** 1

## Agent Task Brief
Hardening items from the NG-1 reviews that are not covered by other cards: 1. Look-alikes that only end elsewhere are accepted (99 percent in the synthetic evaluation): try endpoint-weighted or velocity features and measure. 2. Distinct unknown reason for anchor mismatch; decide the mixed-anchor policy per profile; one frame with shoulders currently switches the whole capture to the shoulder anchor. 3. Validate matcher options (NaN margin, infinite limit). 4. Reject a supplied shoulder reference that is degenerate as bad_landmarks instead of falling back to the hands anchor. 5. Validate shoulders with Array.from so a sparse array returns bad_landmarks instead of throwing. 6. Canonicalise one-handed profiles to one hand slot. 7. Add a test for a calibrated median above the fallback floor; fix the features.ts comment about shoulders on one point. 8. Two examples do not protect against a mislabelled one: warn in the teach flow. Moved elsewhere: segmentation (NG-18), left/right and coordinate rules (NG-16, NG-3), stored-example format (NG-19), validation chain (NG-11). Items 3, 4, 5 and 7 are small and can be taken first as one task.
