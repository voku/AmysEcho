# NG-8: Recognition follow-ups from the NG-1 reviews

- **Ticket:** NG-8
- **Lane:** BACKLOG
- **Created:** 2026-11-22T08:25:44+00:00
- **Updated:** 2026-11-22T08:25:44+00:00
- **Summary:** Hardening and design items the NG-1 reviews found that belong to later work.
- **Next:** Pick items up together with NG-2 (storage) and NG-3 (camera); each needs a test.
- **Validation:** npm ci --ignore-scripts && npm run typecheck && npm run build && npm test && npm run smoke:offline
- **Format version:** 1

## Agent Task Brief
1. Look-alikes that only end elsewhere are accepted (99 percent in the synthetic evaluation): try endpoint-weighted or velocity features and measure. 2. Segmentation: start and end are 'a hand is visible'; a resting hand becomes part of the gesture. 3. Decide the left/right convention and front-camera mirroring; canonicalise one-handed profiles to one slot. 4. Distinct unknown reason for anchor mismatch; decide the mixed-anchor policy per profile; one frame with shoulders currently switches the whole capture to the shoulder anchor. 5. Store unweighted features or version the extraction parameters so stored examples survive retuning. 6. Validate matcher options (NaN margin, infinite limit) once storage or a worker supplies them. 7. Reject captures with a vanishing shoulder width via a minimum scale. 8. Point has no depth or per-landmark confidence. 9. Add a test for a calibrated median above the fallback floor; fix the features.ts comment about shoulders on one point. 10. Two examples do not protect against a mislabelled one.
