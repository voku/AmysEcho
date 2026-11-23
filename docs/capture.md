# Camera capture

Card NG-3. Code: `src/capture/capture.ts` (controller, tracker cache, camera-test entry),
`src/capture/tracker-worker.ts` (the tracker in a module worker), `src/recognition/tracker-adapter.ts`
(tracker output to the matcher's `LandmarkFrame`). Tests: `test/capture.test.mjs` (Node) and
`test/browser/dgs-capture.test.mjs` (Chromium). The decision it follows is
[tracker-decision.md](tracker-decision.md) (card NG-16); the matcher's input contract is in
[recognition.md](recognition.md).

## Verification status

- Tested in Node with synthetic tracker output, a fake camera and a fake tracker, and in headless
  Chromium 157 (Playwright 1.63.0) on a 4-core desktop VM with Chromium's fake camera playing DGS
  videos and a synthetic picture. **No phone, no real camera, no child.** The card cannot be called
  verified without a physical-device observation (frame rate, heat, GPU delegate, front camera
  unflipped, a child's hands): items 1 to 7 of "Not verified" in the decision record are all still
  open.
- Headless Chromium cannot show a permission prompt. A refused prompt is simulated in the browser
  test by a `getUserMedia` that rejects with `NotAllowedError`, as Chromium does on refusal; "no
  camera" is real (Chromium without a camera device).

## What it does

- **Entry.** `index.html#kamera-testen` shows a small German section "Kamera testen" under the
  board: "Kamera starten", a live line "Keine Hand / Eine Hand / Zwei Hände im Bild" plus whether
  shoulders are seen, "Kamera stoppen", and "Zurück zur Tafel". Without that address the section
  stays hidden and empty, so a child on the board never sees it. It is a test entry for caregivers
  and developers; teaching and recognising belong to the caregiver area (cards NG-19, NG-20). It
  was not placed in the caregiver area because that needs `src/caregiver.ts`, outside this card.
- **The camera only after a tap.** `capture/capture.js` is loaded by `index.html` as its own module
  next to `main.js` (a failure in it cannot stop the board) and only wires the section. The camera
  is requested only by `startCapture`, which only the tap on "Kamera starten" calls. Order on the
  tap: the tracker files are made ready and the tracker worker starts; only then the camera is
  requested, so a tracker that cannot load never costs a camera prompt.
- **Nothing is kept or sent.** Each camera frame becomes an `ImageBitmap`, is transferred to the
  worker and closed there as soon as it is tracked. The `<video>` element is hidden and only a
  frame source; there is no preview. The camera test keeps no frames at all. A caller that asks
  (`record: true`, used by the browser test) gets landmark numbers of one capture in memory, at
  most `MAX_RECORDED_FRAMES` (600). Leaving the page, hiding it, "Kamera stoppen" and "Zurück zur
  Tafel" stop every camera track and close the tracker.
- **German messages** for: camera refused ("Die Kamera ist nicht erlaubt …"), no camera, camera
  busy, a browser without camera support, a tracker that cannot be loaded ("… Beim ersten Mal
  braucht sie Internet (etwa 25 MB) …"), and a tracker that fails while running. Each says the
  board works without the camera where that is true; "Zurück zur Tafel" is always there.
- **Tracking.** In a module worker: the hand landmarker with `numHands: 2` on every frame, the pose
  landmarker (lite) on every 5th frame (`POSE_EVERY`) for the shoulders, delegate `CPU`. GPU is an
  option of the code (`delegate: "GPU"`) but not the default: headless Chromium has only a
  software GPU, which was far slower in the spike; which delegate a phone gets is for the phone
  probe.

## The tracker files and their cache

- **Version.** `@mediapipe/tasks-vision` **0.10.35**, an exact devDependency, for the reason in the
  decision record (from 1.0.0 on the package uploads usage metrics to Google). It is the only
  dependency the app ships, and it is not a runtime npm dependency: `package.json` has none.
  Playwright 1.63.0 is a devDependency for the browser test only.
- **Nothing binary is committed.** `scripts/assemble.mjs` (part of `npm run build`) copies the
  three runtime files (`vision_bundle.mjs`, `wasm/vision_wasm_module_internal.js` and `.wasm`;
  only the module variant, which the module worker needs) from `node_modules/`, and downloads the
  two models from Google's model storage at pinned URLs (`hand_landmarker/float16/1`,
  `pose_landmarker_lite/float16/1`). Every file is checked against a sha256 written in the script;
  a mismatch or a different installed version fails the build. Models are kept in
  `node_modules/.cache/amysecho-tracker-models/` so a rebuild does not download again. The build
  therefore needs `storage.googleapis.com` once per fresh `node_modules`; the browser never
  contacts it.
- **Output.** `dist/vendor/mediapipe/`: the five files, `manifest.json` (path, size and sha256 of
  each, and a cache name that changes whenever any file changes), `LICENSE.txt` (the Apache
  License 2.0 text; the package has no licence file of its own, so the build copies the text from
  the pinned TypeScript devDependency, which is under the same licence, and checks that it is that
  text) and `NOTICE.txt` (package, version, both models and their licence).
- **Own cache, filled on the tap.** The files are **not** in the board's pre-cache
  (`public/sw.js`). On "Kamera starten", `prepareTrackerFiles` reads the manifest, asks for
  persistent storage (`navigator.storage.persist()`), downloads each missing file from the app's
  own origin, checks size and sha256, and puts it into the cache named in the manifest
  (`amysecho-tracker-0.10.35-…`); the manifest goes in last and marks the cache complete. Then
  older tracker caches are deleted. A failed or wrong download throws, the capture answers
  "tracker_unavailable", no camera is requested, and the board's install and start are untouched.
- **Service worker.** `activate` still deletes only old `amysecho-ng-*` caches, which the tracker's
  prefix does not match. `fetch` finds the tracker files in their cache, ignoring the query string
  for `vendor/mediapipe/` (the worker loads the wasm loader a second time as `...js?task=pose`,
  see the decision record), and fetches the tracker manifest from the network first, so a new
  build is noticed, with the cached one offline. The board's cache name is now `capture-v1`; its
  pre-cache gains `capture/capture.js`, `capture/tracker-worker.js`, `recognition/tracker-adapter.js`
  and `recognition/features.js` (small app code, so the page loads offline without errors).
- **Checks.** `npm run smoke:offline` also fetches every file of the tracker manifest, compares size
  and sha256, and fails when one of them is in the board's pre-cache. `test/capture.test.mjs`
  checks the pinned version and checksums, the licence and notice, and that the vendored JS and
  wasm (and the app's own JS) name no host except a fixed list of documentation links found in
  comments and error texts, and no Google API, telemetry or `sendBeacon` at all; the same check
  catches the 1.x logger. The browser test aborts and records every request that leaves the app's
  origin and fails on any.
- **Re-checking the pin.** Whoever updates the package or a model repeats the decision record's
  network check (`node run-browser.mjs telemetry` in the spike), updates the sums in
  `scripts/assemble.mjs` and runs the tests above. Who does this and when is not decided yet: it
  needs an owner decision (proposal: the caregiver/maintainer, at the latest when Renovate proposes
  a tasks-vision update, which `renovate.json` must then not auto-merge).

## Content Security Policy

The only change: `script-src 'self' 'wasm-unsafe-eval'` (the wasm does not compile without it). No
`unsafe-eval`, no `blob:`, no new host. The meta-tag policy does not cover the worker; that is why
the shipped tracker must not contain network code (checked as above). A host that can send headers
should send the same policy as a header (decision record).

## The adapter and the matcher's input contract

`toLandmarkFrames(trackerFrames)` turns one capture into the `LandmarkFrame[]` that
`buildFeatureSequence` in `src/recognition/features.ts` takes:

- **Equal scale on both axes:** normalised x times the image width, y times the image height, from
  the size of the very bitmap the tracker saw.
- **`left` is the child's own left hand.** Frames go to the tracker unflipped; MediaPipe's label is
  taken as it comes ("Left" = the subject's left hand on unflipped frames, as the spike found on
  MediaPipe's test photos). `inputMirrored` exists for a source that delivers flipped frames. In the
  DGS browser run the label was cross-checked with the pose model's wrists (pose landmark 15 is the
  left wrist, 16 the right): see the numbers below. That is a check of two models of one package
  against each other, not ground truth; the phone item "hold up the left hand" stays open.
- **One label per physical hand.** Each hand is followed through the capture by its wrist (the
  pairing of the frame's hands with the open tracks that has the smallest total distance, within
  `MIN_JUMP_HAND_SIZES` hand sizes or `MAX_HAND_SPEED` hand sizes per second); a track ends after
  `MAX_TRACK_GAP_MS` (the matcher's 500 ms). Its side is the score-weighted majority of its labels;
  of two hands seen at the same time the one seen longer chooses first. So single-frame label
  flicker, two hands with the same label, and hands that cross keep their slots.
- **Ghosts.** A followed hand seen in fewer than `MIN_TRACK_FRAMES` (2) frames is removed: a single
  false frame of a second hand otherwise makes a still one-hand sign `hands_unclear` (the
  follow-up in recognition.md). No threshold of the matcher was changed.
- **Shoulders** from pose landmarks 11 and 12, both inside the picture and with visibility ≥ 0.5.
  The pose model also reports high visibility for shoulders it only guesses, so this is a weak
  guard. Pose runs on every 5th frame; frames without pose have `shoulders: null`, and the matcher
  uses the median of those it has. `shoulders: "never"` anchors a whole profile to the hands.
- Timestamps are milliseconds from the capture's first frame, strictly increasing (the tracker's
  video mode needs that).

## The DGS browser test

`npm run test:browser` (part of `npm run verify`) runs `test/browser/dgs-capture.test.mjs`:

1. **Board path**: the board loads, the service worker takes control, the page is reloaded; no
   `getUserMedia` call, camera permission still "prompt", no request to `vendor/mediapipe/`, the
   tracker worker never started, no tracker cache. Then with every tracker download aborted: the
   camera test shows the German tracker message, still no camera request, no tracker cache; back
   to the board; offline reload: the board starts. No request leaves the origin.
2. **Camera test with Chromium's fake camera** (a synthetic picture): no camera request before the
   tap; after "Kamera starten" the tracker cache `amysecho-tracker-0.10.35-…` exists, the live line
   says "Keine Hand im Bild. Schultern nicht zu sehen.", the video element is hidden; after
   "Kamera stoppen" the camera track is `ended` and the video element is gone; no console error
   except the wasm's own "INFO:" start-up lines.
3. **No camera / refused camera**: German messages, "Zurück zur Tafel" returns to the board.
4. **DGS videos as the camera**. The videos are SignDict.org community videos of adult signers
   (CC licences, to be verified per video), kept with Git LFS on `main_old` in
   `server/data/dgs_video_examples/`. The test reads them at test time with `git show
   origin/main_old:<file>` and `git lfs smudge`, converts each to y4m with ffmpeg in a temporary
   directory and deletes it after use. Nothing of them is added to `main` or uploaded. Each video
   is played by Chromium's fake camera (it starts the file at its first frame when the camera
   opens, and loops it); the app's own `startCapture`, worker and vendored tracker record two
   passes of it. The frames then go through the adapter, `buildFeatureSequence`, `calibrateMaxDistance`
   and `matchGesture` in Node.
   - **Words**: every word with at least three distinct videos (`<group>_main_<word>.mp4`,
     `<group>_var_<word>_<n>.mp4`, duplicates removed by LFS object id; each word on its own, so
     `trinken_*_kaffee` is "kaffee"). "äpfel" is left out as the plural of "apfel". Of the app's
     concepts only "trinken" and "fertig" have three videos; "hilfe", "mehr" and "pause" have one
     or none. **Plain run (CI)**: trinken, fertig, danke, milch, oma, banane, kaffee.
     **`DGS_FULL=1`**: all 27 such words, plus all words with one or two videos as never-taught
     signs.
   - **One hand or two hands is measured**, not listed: a word is two-hand when in most of its
     videos both hands are seen in at least half of the frames with a hand.
   - **Other signers** (leave one out): each video is attempted against a profile of all other
     videos, so its word has two or three examples, all by other signers.
   - **Same video again**: each video's second pass through the camera is attempted against a
     profile of all first passes (its own included). Only the tracker and the timing of the capture
     differ between the passes.

### Measured

Desktop VM, headless Chromium, two browsers at once, CPU delegate, 2026-11-23. Cells are
top-1 / spoken as a wrong concept / answered "unknown". "Chance" is top-1 by guessing one of the
taught words.

**Full set, `DGS_FULL=1 npm run test:browser`** (27 words, 86 videos of taught words, 96 videos of
71 never-taught words; 9.4 frames per second median; videos 1.3 to 7.4 s, median 3.2 s):

| Attempt | One-hand (20 words) | Two-hand (7 words) | All (chance 3.7%) |
| --- | --- | --- | --- |
| Other signers (leave one out) | 3.1% / 18.8% / 78.1% (64) | 13.6% / 31.8% / 54.5% (22) | 5.8% / 22.1% / 72.1% (86), top-3 13/86 |
| Same video, second pass | 57.8% / 0.0% / 42.2% (64) | 59.1% / 0.0% / 40.9% (22) | 58.1% / 0.0% / 41.9% (86) |

- Two-hand words in that run: banane, bruder, kaffee, milch, mittagessen, orange, weinen; the
  other 20 one-hand.
- Never-taught words: 22 of 96 videos were spoken as one of the 27 concepts.
- No sequence built (first passes, all 182 videos): `hands_unclear` 32, `no_hands` 2 (in
  `ja_main_ja.mp4` and `nein_var_nein_0.mp4` the tracker never saw a hand). Unknown answers of the
  taught attempts: `ambiguous` 29, `hands_unclear` 17, `too_far` 15, `other_hands` 1.
- Left/right against the pose model's wrists: 453 of 463 hand sightings agree (97.8%).

**Plain run (CI subset), `npm run test:browser`** (7 words, 22 videos; chance 14.3%), three local
runs (the third is the final `npm run verify`):

| Run | Attempt | One-hand | Two-hand | All |
| --- | --- | --- | --- | --- |
| 1 | Other signers | 0% / 25.0% / 75.0% (12) | 10.0% / 0% / 90.0% (10) | 4.5% / 13.6% / 81.8% |
| 1 | Same video, second pass | 50.0% / 0% / 50.0% (12) | 40.0% / 0% / 60.0% (10) | 45.5% / 0% / 54.5% |
| 2 | Other signers | 0% / 6.3% / 93.8% (16) | 16.7% / 16.7% / 66.7% (6) | 4.5% / 9.1% / 86.4% |
| 2 | Same video, second pass | 37.5% / 12.5% / 50.0% (16) | 66.7% / 0% / 33.3% (6) | 45.5% / 9.1% / 45.5% |
| 3 | Other signers | 0% / 31.3% / 68.8% (16) | 16.7% / 16.7% / 66.7% (6) | 4.5% / 27.3% / 68.2%, top-3 8/22 |
| 3 | Same video, second pass | 43.8% / 0% / 56.3% (16) | 50.0% / 0% / 50.0% (6) | 45.5% / 0% / 54.5% |

Run 1 measured banane, fertig, kaffee as two-hand; runs 2 and 3 kaffee and milch. **Which group a word
falls into changes between runs**: the frames differ from run to run (which camera frames the
tracker gets depends on timing), and for several signers the second hand is in view for about half
of the time, the matcher's own limit (`HAND_PRESENCE_SHARE`). Left/right agreed with the pose
wrists in 51/56, 50/54 and 59/60 sightings.

What the numbers say:

- **Across signers the matcher is at about chance.** Each word's two or three examples are other
  adults, often with another variant of the sign, in another framing; most attempts are `unknown`
  and about a fifth are spoken as a wrong concept. This is not the product's case (one child
  teaching and repeating its own gestures), but it is a warning: examples that differ as much as
  different signers do are not separated by the matcher, and a wrong concept is then common, so
  the UI must confirm before speaking (recognition.md, "Known limits").
- **The same signing seen again is recognised about half of the time and was spoken as a wrong
  concept in 2 of 152 attempts over the four runs.** Between the passes only the tracker and the
  frame timing differ, so this is the floor of what tracker noise at about 9 frames per second
  costs. The misses are mostly `hands_unclear` (a second hand in view for a fifth to a half of the
  time), then `too_far` and `ambiguous`.
- No limit of the matcher was changed for these numbers.

### What the DGS test asserts, and why

- **Pipeline**: every video gives at least 3 tracked frames per second, with the image size; pose
  ran in every video; a hand is seen in at least 90% of the videos (two SignDict videos never
  show one); at least two words are measured as two-hand and two as one-hand; in no frame do both
  slots hold the same hand; no request leaves the app's origin.
- **Determinism**: the adapter, feature builder and matcher give identical answers when the same
  frames are evaluated twice (other-signer and second-pass evaluation).
- **Left/right**: at least 90% of hand sightings agree with the pose model's wrists (measured
  97.8%, 91%, 93%, 98%).
- **Same video, second pass**: top-1 at least **twice chance** (14.3% x 2 = 28.6% in the plain run,
  7.4% in the full set; measured 45.5%, 45.5%, 45.5% and 58.1%) and spoken as a wrong concept at most
  **20%** (measured 0%, 9.1%, 0% and 0%). Both bounds are well inside what was measured, and with 22
  attempts a stricter ceiling (10% is two attempts) would fail on noise: run 2 had two.
- **Other signers: nothing is asserted.** The measured top-1 is at chance and the wrong-concept
  share is 9% to 27%; asserting "above chance" would be false, and a ceiling on wrong concepts
  would only encode today's noise. The rates are printed for the record.

### Time

The plain browser test (`npm run test:browser`) took 110 s locally (board and camera tests about
5 s, DGS capture 107 s for 22 videos, two passes each, two browsers); all of `npm run verify` took
2 min 16 s. The full set took 15 min of capture (182 videos). A CI runner is slower; the job's
time limit was raised from 10 to 20 minutes.

### Running it

- Locally: `npm run verify` (needs `origin/main_old` fetched, Git LFS, ffmpeg and Playwright's
  Chromium). Without `origin/main_old` (an exported copy without Git history) the DGS test is
  skipped with that reason; under `CI=true` it fails instead. `DGS_FULL=1 npm run test:browser`
  for the full set; `DGS_PARALLEL=<n>` browsers at once (default 2).
- CI (`.github/workflows/ci.yml`) fetches `main_old` with depth 1 (the checkout fetches only the
  tested commit), installs Chromium with `npx playwright install --with-deps chromium`, installs
  ffmpeg if the runner lacks it, and runs `npm run verify` on Node 22 and 24. The LFS videos are
  downloaded anonymously from GitHub's LFS storage (about 4 MB per run), which counts against the
  repository's LFS bandwidth.
- `DGS_FRAMES_OUT=<file>` writes the recorded tracker frames, `DGS_FRAMES_IN=<file>` evaluates
  such a file again without capturing. These are adult signers' landmarks from public videos, not
  child data, but they are not to be committed either (`*.landmarks.json` is ignored).

## Known limits and open points

- Everything in "Not verified" of the decision record: frame rate, heat and battery on the phone,
  GPU delegate, whether the front camera delivers unflipped frames, a child's hands, shoulders when
  the device lies or stands where it is used, the first 25 MB download on mobile data, memory.
  The card's own note applies: if hands-only tracking is too slow, hot or battery-hungry on the
  phone, stop and reconsider.
- A caregiver's hand in the picture is tracked like the child's; with `numHands: 2` it can take a
  slot. Nothing here tells them apart (see `hands_unclear` in recognition.md).
- Shoulders: anchors are not carried from one capture to the next; a capture with shoulders and
  one without are not comparable (recognition.md, "Input contract").
- The camera test entry is reached only by its address; the caregiver area gets a proper entry with
  cards NG-19 and NG-20.
- The frame rate in the browser test (about 10 per second on the desktop VM with two browsers at
  once) is the rate of the whole pipeline (camera frame, bitmap, worker round trip with pose on
  every fifth frame), not a phone number.
