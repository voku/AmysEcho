# Hand tracking for Amy's Echo NG: decision record (NG-16)

Spike date 2026-11-22. The browser numbers were measured in headless Chromium 157 on a 4-core desktop
VM; the adapter and matcher counts come from a Node test. **None of it is a phone number.** Nothing in the app repository was changed.

## Recommendation

| Question | Answer |
| --- | --- |
| Tracker | `@mediapipe/tasks-vision`, **pinned to exactly 0.10.35** |
| Why not the latest (1.2.3) | From 1.0.0 on, the package uploads usage metrics to Google (see "Metrics upload"). 0.10.35 is the last release without that code. Tracking results and speed were the same in both. |
| Models | `hand_landmarker.task` (float16, v1) with `numHands: 2`, plus `pose_landmarker_lite.task` (float16, v1) for the shoulders |
| Holistic instead? | Not tested, not recommended: it always runs a face model too, and finds hands from the body pose, so a close-up without a visible body would lose the hands. |
| Where it runs | In a Web Worker (module worker). The main thread sends one `ImageBitmap` per camera frame. |
| Delegate | Unknown until measured on the phone. Try `GPU` first there, keep `CPU` as fallback. Headless Chromium only has a software GPU, so the spike cannot answer this. |
| Pose every frame? | No. Run pose on about every 5th frame. The matcher takes the median shoulder position of a capture, and attempts with pose on every 5th frame matched 220/220 in the synthetic test. |

Hands-only (no pose) stays possible: the adapter has `shoulders: "never"`. A profile must use one
of the two for all its examples and attempts; they cannot be mixed (see "Matcher gaps").

## Licence and size

| File | Version | Licence | Bytes |
| --- | --- | --- | --- |
| `vision_bundle.mjs` | 0.10.35 | Apache-2.0 (package.json) | 136,993 |
| `wasm/vision_wasm_module_internal.js` | 0.10.35 | Apache-2.0 | 322,082 |
| `wasm/vision_wasm_module_internal.wasm` | 0.10.35 | Apache-2.0 | 11,153,641 (3.3 MB gzipped) |
| `hand_landmarker.task` | float16/1 | Apache-2.0 (Google model card "Hand Tracking (Lite/Full)") | 7,819,105 |
| `pose_landmarker_lite.task` | float16/1 | Apache-2.0 (Google model card "BlazePose GHUM 3D") | 5,777,746 |

Total added to the offline cache: **about 25.2 MB** with pose, 19.4 MB without. The models barely
compress. Only one wasm variant has to be shipped (the package contains three). For comparison,
1.2.3 has a 14.7 MB wasm. The package has no LICENSE file of its own; the Apache-2.0 text and a
notice naming the package and both models have to be added to the repository.

Model downloads from `storage.googleapis.com/mediapipe-models/...` worked (HTTP 200); nothing was
blocked by the network policy. sha256: hand `fbc2a300...607cde1`, pose `59929e1d...690d574a`.

## Metrics upload in 1.x (the reason for the version choice)

- `vision_bundle.mjs` of 1.0.0, 1.1.0, 1.2.0 and 1.2.3 contains a logger that POSTs to
  `https://odml.pa.googleapis.com/v1/log` every 60 s and on `close()`. The 1.2.3 README says so
  ("Privacy Notice") and makes the app responsible for consent. 0.10.14 to 0.10.35 do not contain it.
- Measured with 1.2.3 (all requests were caught and aborted by the test runner, nothing was sent):
  - main thread: the app's `connect-src 'self'` blocks it (2 to 4 CSP violations per run);
  - **worker with the CSP only in a `<meta>` tag, as the app has it today: 2 POSTs of about
    140 bytes left the browser.** A `<meta>` CSP does not apply to a worker;
  - worker with the same CSP sent as an HTTP header: nothing left.
- 0.10.35 in the same eight runs: no external request, no violation.
- The product contract forbids cloud telemetry (section on persistence, line 61).

Whoever updates the package later must repeat this check (`node run-browser.mjs telemetry`).

## CSP and service worker changes

CSP, measured against the app's exact policy:

- **One change: `script-src 'self' 'wasm-unsafe-eval'`.** Without it the wasm does not compile.
  `'unsafe-eval'` is not needed. No `blob:`, no change to `worker-src`, `connect-src`, `img-src`.
- The worker is not covered by the `<meta>` policy (it ran even without `'wasm-unsafe-eval'`). If
  the host can send headers, send the same policy as a `Content-Security-Policy` header; the worker
  then needs `'wasm-unsafe-eval'` too (tested). If it cannot, the worker runs with no CSP at all,
  which is one more reason to ship a package without network code.
- Do not mirror the preview with an inline `style`; `style-src 'self'` blocks that. Use a class.

Service worker (`public/sw.js`):

- Add the five files above to the precache and bump `CACHE_NAME`. The spike used the app's own
  install/activate/fetch logic with only the list changed: after one online load, the page ran with
  the network off, on the main thread and in a worker. The retained result of that run counts one request
  reaching the server while offline, and what it was is not recorded; check it again with the
  offline browser test of card NG-14. Without the service worker the offline load failed, as expected.
- `cache.addAll` is all-or-nothing. A failed 25 MB download would also fail the board's install.
  Put the tracker files in their own cache (own name and version), fill it when a caregiver turns
  gestures on, and keep the `activate` clean-up from deleting it.
- In a module worker a second task fails with `ModuleFactory not set`, because the wasm loader
  module is only evaluated once. Fix used in the spike: load it under a second URL
  (`...module_internal.js?task=pose`). The cache lookup must then ignore the query string for this
  file, or that exact URL must be precached. A classic worker does not have the problem (tested).

## Left/right convention

**`left` is the child's own left hand, `right` the child's own right hand**, wherever they are in
the picture. Frames go to the tracker exactly as the camera delivers them, not flipped; only the
on-screen preview is mirrored, with CSS.

Why: a one-hand gesture then always lands in the same slot, hands that cross or swap sides keep
their slot, and it does not depend on where the child stands. "Side of the picture" breaks on all
three.

Evidence (MediaPipe's own test images, both package versions, identical results):

- `left_hands.jpg` (two left hands, backs visible): both labelled `Left` (0.94). Flipped: `Right`.
- `right_hands.jpg`: both `Right`. Flipped: `Left`.
- `woman_hands.jpg` (a person, both hands): the hand of her left arm `Left` (0.96), the other
  `Right` (0.94). Flipped: labels swap.
- So on an unflipped picture the label is the subject's real hand; flipping the picture inverts it.
  The adapter has `inputMirrored` for a device that delivers flipped frames; with it set, the
  features are identical (distance 1e-15), without it nothing matches (distance 3.2).
- Each physical hand is followed through the capture and gets the majority label, so single-frame
  label flicker does not matter: with labels swapped on 10% of frames, trusting each frame gave
  158/220 matches, voting gave 220/220.

## Measured numbers (desktop headless, not the phone)

Fake camera: a MediaPipe test photo looped as a 480x640 video, two hands visible in every frame.
Chromium delivered it as 480x480. 0.10.35, median / 95th percentile in ms:

| Variant | Init | First frame | Hands (2) | Pose | Both, per frame |
| --- | --- | --- | --- | --- | --- |
| Main thread, CPU | 510 | 434 | 66 / 81 | 32 / 45 | 98 / 119 |
| Module worker, CPU | 495 | 379 | 64 / 84 | 31 / 37 | 97 / 116 (round trip incl. `createImageBitmap`) |
| Classic worker, CPU | 472 | 416 | 65 / 86 | 31 / 41 | 98 / 126 |
| Main thread, CPU, throttled 4x | 1517 | 1954 | 277 / 380 | 138 / 192 | 416 / 550 |
| Any thread, "GPU" | ~420 | ~7000 | ~500 | ~190 | ~690 |

- Hands only: 67 ms per frame (about 14 frames per second); with pose on every frame about 10.
- One hand visible costs the same as two (69 ms): with `numHands: 2` the palm detector runs on
  every frame while it looks for the second hand. No hand in a large picture was the slowest case.
- The "GPU" rows are a software renderer (SwiftShader). They say only that the GPU path
  initialises and works in a worker with an `OffscreenCanvas`. They say nothing about speed.
- The wasm ran single-threaded, with SIMD. 1.2.3 numbers were within noise of these.
- The fake camera has no `facingMode`; `getUserMedia({ video: { facingMode: "user" } })` succeeded,
  but which camera a phone picks is not shown by this.
- Pose found both shoulders (visibility 0.99) in an upper-body crop and in a head-and-shoulders
  crop of MediaPipe's `pose.jpg`. It found no body in `woman_hands.jpg`, where the arms cover the
  chest. Shoulders will be missing in some real captures.

## Verified and not verified

Verified in headless Chromium: same-origin loading of bundle, wasm and models; offline after first
load; the single CSP change; worker and main thread; `detectForVideo` per camera frame; two hands
with 21 points and a handedness label each; label behaviour under flipping; shoulders from pose;
the adapter type-checks against the app's `features.ts` and feeds the real feature extraction and
matcher.

Not verified, needs the phone (Redmi Note 14 Pro, Android Chrome):

1. Frames per second and time to first result, CPU and GPU, one hand and two hands, 5 minutes long
   (heat, throttling). This decides whether the plan works at all.
2. Whether the GPU delegate starts in a worker on that phone.
3. Whether front-camera frames arrive unflipped: hold up the left hand, the label must be `Left`.
4. Handedness and tracking on a child's hands, palm and back, at tablet distance, in room light.
5. How often both shoulders are visible when the phone lies or stands where it will be used.
6. First install of 25 MB on mobile data, and cold start offline from the installed app.
7. Memory: two models in a worker next to the camera.

No real hand footage was used beyond MediaPipe's test images. Their photo licences are not stated;
they must not be committed. They are only in the spike folder.

## One hand and two hands: what the matcher does today

Synthetic test (`adapter/test.mjs`, output in `results/adapter-test.txt`): one profile with 5
two-hand and 6 one-hand gestures, one of which is a two-hand gesture without its left hand; 3
examples each, 20 attempts each from another camera position. **Made-up movements; these are not
accuracy numbers.**

| Case | One-hand | Two-hand |
| --- | --- | --- |
| Baseline, mixed profile | 120/120 | 100/100 |
| Second hand appears for 3 frames mid-gesture | 120/120 | - |
| ... for 6 frames | 83/120, rest `too_far` | - |
| ... for 12 frames | 4/120, rest `too_far` | - |
| ... for 12 frames, adapter drops hands seen in fewer than 15 frames | 120/120 | - |
| Second hand for 3 frames just before the gesture starts | 109/120 | - |
| One hand of a two-hand gesture lost for 4 / 6 / 8 / 12 frames | - | 99 / 91 / 18 / 0 of 100 |
| No shoulders in the attempt, shoulders in the examples | 0/120 `no_examples` | 0/100 `no_examples` |
| Profile without shoulders at all | 120/120 | 99/100 |
| Attempts at about 7 frames per second, examples at 27 | 120/120 | 98/100 |
| Landscape sensor attempts against portrait examples | 120/120 | 100/100 |

No attempt was ever spoken as a wrong concept or as a concept of the other group; failures were
all `unknown`. One-hand and two-hand captures give the same `FeatureSequenceV1` shape (32 x 86,
unused hand slot all zero), and a mixed profile works: the closest example of the other group was
2.05 to 2.83 away, against limits of 0.75 to 1.5.

Matcher gaps:

1. **A hand that is there only part of the time breaks the match.**
   `src/recognition/features.ts:163-181` fills gaps of up to 6 frames (`:28`) and nothing else;
   there is no rule for "this hand was too brief to count". Needed: drop a hand seen for less than
   a share of the gesture (the adapter's `minHandFrames` shows the effect), and express both limits
   in milliseconds, since 6 frames are 0.2 s at 30 frames per second and 0.8 s at 7.
2. **Any visible hand starts and ends the gesture** (`features.ts:218-224`). A second hand that
   flickers in before the start stretches the gesture. This is NG-18.
3. **One-hand and two-hand gestures are separated only by distance**
   (`src/recognition/matcher.ts:53-68`), not by rule. It held in the test, but the presence flags
   alone guarantee only 1.0 and a concept's limit can reach 1.5. Cheap fix: read which hands a
   sequence uses from its presence columns and skip examples that use other hands, as is done for
   the anchor at `matcher.ts:56`.
4. **Shoulders seen in examples but not in the attempt (or the reverse) gives `no_examples`**
   (`features.ts:111-126`, `matcher.ts:56`). With real pose tracking this will happen. Either store
   both anchors per example, or decide per profile and force it in the adapter.
5. **The same gesture made with the other hand is a different gesture.** That follows from the
   convention; teaching has to say so, or offer "record with the other hand too".

## Build plan

Each step is small. "CI" means Node tests with synthetic or replayed landmark frames, no camera.

**NG-16 (decision record)**
1. This record, and the input contract in `docs/recognition.md` updated with the left/right
   convention. Done with this card.
2. Phone probe, not committed: a page like the spike's on the phone, items 1 to 5 of the list above.
   Phone only. If hands-only is below about 10 frames per second on both delegates, stop and
   reconsider (smaller input, `numHands` 1 while teaching one-hand gestures, pose off).

**NG-3 (camera capture)**
3. The adapter from tracker output to landmark frames, in `src/recognition/`, rebuilt from the
   spike's sketch, with its tests. CI: all of it.
4. Vendor the five files (built as it was done: `scripts/assemble.mjs` puts them under
   `dist/vendor/mediapipe/<version>-<digest>/`, not `public/`) with licence notice and checksums; CSP
   `'wasm-unsafe-eval'`; separate tracker cache in `sw.js`. CI: checksum test, CSP test, offline
   smoke check extended to the tracker files.
5. Tracker worker with a small message protocol (init, frame, result, close, error). CI: protocol
   test against a fake tracker. Headless browser smoke with Chromium's fake camera is possible but
   is not in `npm run verify` today. Phone: it loads and tracks.
6. Capture controller: tap to start, permission request, German messages for denied, missing and
   busy camera, way back to the board, stop on page hide, tracks stopped, no frame kept. CI: state
   machine with a fake `getUserMedia`. Phone: real permission dialogs, denied and revoked.
7. Recorder: tracker frames in memory for one capture, then adapter, then `buildFeatureSequence`.
   CI: replay of synthetic tracker frames, one-hand and two-hand reported separately. Phone and
   child: first real captures, never stored.

**NG-18 (gesture start and end)**
8. Brief-hand rule and gap limits in milliseconds (gaps 1 and 2 above). CI: the T4/T5 cases of the
   spike test as regression tests, one-hand and two-hand numbers separately.
9. Motion-based state machine (idle, candidate, active, ended or invalid, cooldown) on landmark
   frames. CI: synthetic rest-then-move captures, hand entering, hand leaving, hands swapping
   sides. Phone and child: whether real rests and real starts are found; thresholds come from
   recorded landmark sequences, which need a caregiver's explicit consent.

**NG-19 (stored examples)**
10. Record format: add anchor policy, hands used (left, right, both), tracker and model version,
    adapter convention version. CI: round trip, rejection of other versions, export, restore, delete.
11. Matcher: skip examples that use other hands (gap 3); settle the anchor question (gap 4).
    CI: mixed-profile evaluation, both groups reported separately. Phone: nothing new.

**NG-20 (teach, recognise, confirm, speak)**
12. Teach flow in the caregiver area: pick concept, record three examples, show "one hand" or
    "two hands" as detected, reject an example that disagrees with the earlier ones. CI: flow with
    replayed captures. Phone and child: is three examples realistic, does the child repeat.
13. Recognise flow: tap, gesture, show the best match to confirm, top three or board on unknown,
    speak only after confirmation, cooldown, cancel. CI: flow with replayed captures and a fake
    speech output. Phone and child: the real communication test of the product contract.

## Files

The spike (page, workers, Playwright runs, raw results and the adapter sketch) was built outside
the repository and is not committed. The MediaPipe test photos it used show real people and are
not to be committed. The camera task (card NG-3) rebuilds the adapter inside `src/recognition/`
with tests on synthetic tracker output.
