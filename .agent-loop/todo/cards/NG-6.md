# NG-6: Device verification: offline cold start and local German speech on the target phone

- **Ticket:** NG-6
- **Lane:** BLOCKED
- **Domain:** human
- **Created:** 2026-11-22T08:00:52+00:00
- **Updated:** 2026-11-25T19:49:50+00:00
- **Summary:** Needs a person with the target device: install, airplane mode, camera denied, cold start, enumerate local German voices and speak.
- **Next:** Human task. Record device, OS and browser versions and results in the contract ledger without personal data. Since NG-56 also, on the target device: record a 'Vormachen' clip (which recorder type, MP4 on Safari; size of a 5 s clip; is facingMode reported); does the recorder hand over within DEMO_STOP_WAIT_MS (5 s); does a clip recorded in another browser play; does playing a clip during recognition lower the tracker's frame rate; are the clip buttons in portrait large enough.
- **Validation:** Manual protocol in docs/s0a-product-contract-v0.1.md section 4
- **Priority:** 0
- **Wave:** Wave 1 - board (S1)
- **Format version:** 1

## Agent Task Brief
Goal: the claims 'works offline' and 'speaks German offline' are verified or explicitly marked unmet for each supported device. Human task with the target phone or tablet: install, airplane mode, camera denied, cold start, list local German voices and speak. Record device, OS and browser versions and results in the ledger in docs/s0a-product-contract-v0.1.md section 4, without personal data. NG-14 covers what CI can check; this card covers what only a physical device shows. Issue 1180.
