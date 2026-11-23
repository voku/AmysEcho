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
  and developers. Teaching gestures is in the caregiver area since card NG-19 (below, "Teaching");
  recognising on the board is card NG-20 ([recognise.md](recognise.md)), through the same bridge.
- **The camera only after a tap.** `capture/capture.js` is loaded by `index.html` as its own module
  next to `main.js` (a failure in it cannot stop the board) and only wires the section. The camera
  is requested only by `startCapture`, which only the tap on "Kamera starten" calls. Order on the
  tap: the tracker files are made ready and the tracker worker starts; only then the camera is
  requested, so a tracker that cannot load never costs a camera prompt.
- **Leaving cancels the start, at every step.** "Zurück zur Tafel", "Kamera stoppen", clearing the
  address, hiding the page and `pagehide` raise one cancel signal (`AbortController`) for the
  current attempt, whether the tracker is still loading, the permission is being asked, or the
  camera runs. Loading stops (the downloads are aborted, a starting worker is terminated); the
  camera is not requested after a cancel, and never while the page is not visible; a camera that
  the browser grants after the cancel (the prompt was already open) is stopped at once, with its
  tracker. Tested in the browser for each of the four ways out, while loading and while the
  permission is asked: no camera request (loading) or no live track (asking), no video element and
  no worker left.
- **Nothing is kept or sent.** Each camera frame becomes an `ImageBitmap`, is transferred to the
  worker and closed there as soon as it is tracked. The `<video>` element is hidden and only a
  frame source; there is no preview. The camera test keeps no frames at all. A caller that asks
  (`record: true`, used by the browser test, or `startRecording` / `stopRecording`, used by
  teaching) gets landmark numbers of one capture in memory, at most `MAX_RECORDED_FRAMES` (600). Leaving the page, hiding it, "Kamera stoppen" and "Zurück zur
  Tafel" stop every camera track and close the tracker.
- **German messages** for: camera refused ("Die Kamera ist nicht erlaubt …"), no camera, camera
  busy, a browser without camera support; for the tracker: a failed download ("… Beim ersten Mal
  braucht sie Internet (etwa 25 MB) …", `tracker_download`), storage full ("Auf diesem Gerät ist
  nicht genug Speicher frei …", `tracker_storage`, from a `QuotaExceededError`), a download that
  stalls ("Die Handerkennung lädt nicht weiter …", `tracker_timeout`: nothing received for
  `TRACKER_STALL_MS`, 30 s, or the worker not ready within 60 s), anything else (a file that does
  not match its checksum, a worker that fails to load: `tracker_unavailable`), and a tracker that
  fails while running. Each says the board works without the camera where that is true;
  "Kamera starten" is enabled again (the retry) and "Zurück zur Tafel" is always there.
- **Tracking.** In a module worker: the hand landmarker with `numHands: 2` on every frame, the pose
  landmarker (lite) on every 5th frame (`POSE_EVERY`) for the shoulders, delegate `CPU`. GPU is an
  option of the code (`delegate: "GPU"`) but not the default: headless Chromium has only a
  software GPU, which was far slower in the spike; which delegate a phone gets is for the phone
  probe. The pose model runs on every fifth frame only, so the shoulder part holds the last pose result and says the shoulders are gone only after two pose results in a row without them (card NG-41).

## Teaching (card NG-19)

- **Recordings while the camera runs.** `CaptureSession.startRecording()` starts keeping the tracked
  frames (and forgets any kept before, also those of `record: true`); `stopRecording()` returns
  them and stops keeping; the camera and the tracker keep running, so several examples are
  recorded without starting the tracker again. After the capture ended, `startRecording` does
  nothing. Tested in `test/capture.test.mjs`.
- **The bridge.** The caregiver area (`src/caregiver.ts`, part of the board's module graph) must
  not import this module: `index.html` loads it on its own so that a failure here cannot stop
  the board. So this module, when a page loads it (there is a `document`), defines
  `globalThis.amysEchoCapture` (`CAPTURE_BRIDGE_KEY`) as `captureBridge()`: `start(host, options)`
  (`startCapture` with `browserEnvironment(host)`), `CAPTURE_TEXT` and `nextShoulders`. The area
  looks for it when "Kamera starten" is tapped, passes the caregiver region as `host` for the
  hidden video element, and stops the capture through the signal and `stop()` on every way out
  ([caregiver.md](caregiver.md), "Teaching a gesture"). Importing the module in Node defines
  nothing.
- **Recognising on the board** (card NG-20) uses the same bridge: "Gebärde" on the board starts
  it (`start(host, options)` with the gesture view as `host`), the attempt is kept with
  `startRecording` / `stopRecording` after a countdown, and the capture is stopped after every
  attempt and on every way out ([recognise.md](recognise.md)). The browser test
  `test/browser/recognise.test.mjs` replaces this bridge in the page with one that runs the same
  `startCapture` and real tracker on video frames instead of a camera.
- What a recording becomes: `sequenceFromRecording` in `src/recognition/examples.ts` (the adapter,
  then the matcher's feature builder); stored only as features ([recognition.md](recognition.md),
  "Stored examples").

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
- **Output.** `dist/vendor/mediapipe/`: the five files in a directory named after their contents,
  `<version>-<digest>/` (the digest covers every file's sha256, so any changed file changes every
  URL), `manifest.json` (that directory, the cache name `amysecho-tracker-<version>-<digest>`, and
  path, size and sha256 of each file), `LICENSE.txt` (the Apache
  License 2.0 text; the package has no licence file of its own, so the build copies the text from
  the pinned TypeScript devDependency, which is under the same licence, and checks that it is that
  text) and `NOTICE.txt` (package, version, both models and their licence).
- **Own cache, filled on the tap.** The files are **not** in the board's pre-cache
  (`public/sw.js`). On "Kamera starten", `prepareTrackerFiles` reads the manifest, asks for
  persistent storage (`navigator.storage.persist()`), downloads each missing file from the app's
  own origin, checks size and sha256, and puts it into the cache named in the manifest
  (`amysecho-tracker-0.10.35-…`); the manifest goes in last and marks the cache complete. Only
  when it is complete are all other tracker caches deleted. A failed, stalled or wrong download
  throws, the capture answers with its message, no camera is requested, and the board's install
  and start are untouched; the next tap tries again. Offline, a complete cache from earlier is
  used.
- **What happens on an update.** A build whose tracker files changed has a new directory, so new
  URLs and a new cache name. The first tap after the update downloads the new files into the new
  cache (an old cache cannot answer for them, see the service worker below), and once that cache
  is complete the old one is deleted. Until then the old one stays, so offline the old tracker
  still works. A build with the same tracker files keeps directory and cache. (The first version
  of this card kept the file URLs across builds; an old cache then answered for the new files,
  every start failed its checksum and the old cache was never deleted. Regression test:
  "tracker update" in `test/capture.test.mjs`, with the real `sw.js`; reviewer probe
  `p3-sw-update` passes.)
- **Service worker.** `activate` still deletes only old `amysecho-ng-*` caches, which the tracker's
  prefix does not match. `fetch` answers a tracker file `vendor/mediapipe/<directory>/…` only from
  the cache `amysecho-tracker-<directory>` (never from another cache; if that cache does not
  exist, from the network), ignoring the query string there (the worker loads the wasm loader a
  second time as `...js?task=pose`, see the decision record). The tracker manifest comes from the
  network first, so a new build is noticed, and from a complete cache offline. The board's cache
  name is now `capture-v2`; its
  pre-cache gains `capture/capture.js`, `capture/tracker-worker.js`, `recognition/tracker-adapter.js`
  and `recognition/features.js` (small app code, so the page loads offline without errors).
- **Checks.** `npm run smoke:offline` also fetches every file of the tracker manifest, compares size
  and sha256, and fails when one of them is in the board's pre-cache. `test/capture.test.mjs`
  checks the pinned version and checksums, the licence and notice, and that the vendored JS and
  wasm (and the app's own JS) name no host except a fixed list of documentation links found in
  comments and error texts, and no Google API, telemetry or `sendBeacon` at all; the same check
  catches the 1.x logger. That text check only finds literal `scheme://host` strings (a URL built
  from parts would pass it) and its allow-list applies anywhere in the file, not only in comments.
  **The real guard is the browser test**, which aborts and records every request that leaves the
  app's origin, from the page and from the worker, and fails on any.
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
- **Ghost hands: nothing is removed** (`MIN_TRACK_FRAMES` is 1; `minTrackFrames` can be raised by
  a caller). The first version removed every hand seen in a single frame. A review showed the cost:
  a real second hand that the tracker catches only in single frames more than 500 ms apart is then
  removed entirely, and the matcher sees a one-hand capture where its own rules would answer
  `hands_unclear` (no answer); the attempt can then be matched as a one-hand sign or be `too_far`.
  Keeping every sighting can never make a wrong concept more likely than the matcher alone makes
  it, because the matcher was designed and evaluated on exactly this input; removing can. The
  price: a single false frame of a second hand next to a still one-hand sign gives `hands_unclear`
  (the follow-up in recognition.md stays open). Tested: a second hand in five single frames
  900 ms apart is kept and gives `hands_unclear`; removing it gives a one-hand sequence.
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
   camera test shows the German download message (`tracker_download`), still no camera request, no tracker cache; back
   to the board; offline reload: the board starts. No request leaves the origin.
2. **Camera test with Chromium's fake camera** (a synthetic picture): no camera request before the
   tap; after "Kamera starten" the tracker cache `amysecho-tracker-0.10.35-…` exists, the live line
   says "Keine Hand im Bild. Schultern nicht zu sehen.", the video element is hidden; after
   "Kamera stoppen" the camera track is `ended` and the video element is gone; no console error
   except the wasm's own "INFO:" start-up lines.
3. **Leaving while loading or asking**: for "Zurück zur Tafel", clearing the address, a hidden
   page and `pagehide`, each while the tracker download is held back and while the camera request
   is held back (as an open permission prompt would): no camera request while loading; after the
   held request is answered, no live track; no video element and no worker left.
4. **No camera / refused camera**: German messages, "Zurück zur Tafel" returns to the board.
5. **DGS videos as the camera**. The videos are SignDict.org community videos of adult signers
   (CC licences, to be verified per video), kept with Git LFS on `main_old` in
   `server/data/dgs_video_examples/`. The test reads them at test time with `git show
   origin/main_old:<file>` and `git lfs smudge` into a temporary directory and deletes them after
   use. Nothing of them is added to `main` or uploaded.
   - **Tracked at fixed frames, through the app's own capture path.** ffmpeg decodes each video;
     the test hands its frames to the app's `startCapture` with the real `browserEnvironment`
     tracker (the worker and the vendored tracker), replacing only the camera: frame *i* of a pass
     is the video frame at (*i* + phase) / 10 s, with that time as its timestamp (10 frames per
     second, about what the live pipeline reached). Two passes per video, at phases 0 and 0.5, in
     one page. **Why not the live fake camera for this:** with it, which frames the tracker gets
     depends on the timing of the machine, so every number differed from run to run; in five runs
     in a row of the plain set, left/right agreement ranged 89.4% (one run of the coordinator's)
     to 100%, same-video top-1 27.3% to 40.9%, wrong concept 0% to 18.2%, the frame rate 8.7 to
     9.5 per second, and the number of words measured as two-hand 1 to 3; two of the five runs
     failed an assertion. With fixed frames the landmarks are identical from run to run on one
     machine (asserted: one video is tracked a second time in a fresh browser and must give the
     same frames).
   - **The live fake camera is still tested**: the same video (`trinken_main_kaffee.mp4`) is also
     played through Chromium's fake camera into the unchanged capture path; at least 3 frames per
     second must arrive and a hand must be seen. No rate is computed from it.
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
   - **Same video again**: each video's second pass (phase 0.5) is attempted against a profile of
     all first passes (phase 0, its own included). The two passes see the same signing in
     different frames, as two looks at the same movement would; the signer does not change.

### Measured

Desktop VM, headless Chromium, CPU delegate, 2026-11-23, fixed frames as described above (these
numbers repeat exactly on this machine). Cells are top-1 / spoken as a wrong concept / answered
"unknown" (attempts). "Chance" is top-1 by guessing one of the taught words.

**Full set, `DGS_FULL=1 npm run test:browser`** (27 words, 86 videos of taught words, 96 videos of
71 never-taught words; videos 1.3 to 7.4 s, median 3.2 s):

| Attempt | One-hand (20 words) | Two-hand (7 words) | All (chance 3.7%) |
| --- | --- | --- | --- |
| Other signers (leave one out) | 7.8% / 17.2% / 75.0% (64) | 9.1% / 13.6% / 77.3% (22) | 8.1% / 16.3% / 75.6% (86), top-3 24/86 |
| Same video, second pass | 60.9% / 1.6% / 37.5% (64) | 54.5% / 4.5% / 40.9% (22) | 59.3% / 2.3% / 38.4% (86) |

With single-frame hands removed (the first version of the adapter, see "Ghost hands") the same
run gave other signers 11.6% / 16.3% / 72.1% and second pass 59.3% / 2.3% / 38.4%: keeping them
turns three other-signer matches into `unknown` and changes no wrong-concept count.

- Two-hand words: banane, bruder, kaffee, mittagessen, orange, saft, weinen; the other 20 one-hand.
- Never-taught words: 18 of 96 videos were spoken as one of the 27 concepts.
- No sequence built (first passes, 182 videos): `hands_unclear` 40, `hand_lost` 7, `too_short` 1,
  `no_hands` 1 (in `nein_var_nein_0.mp4` the tracker never sees a hand). Unknown answers of the
  taught attempts: `ambiguous` 28, `hands_unclear` 22, `too_far` 12, `hand_lost` 3.
- Left/right against the pose model's wrists: 1231 of 1291 hand sightings agree (95.4%).

**Plain run (CI subset), `npm run test:browser`** (7 words, 22 videos; chance 14.3%). One-hand:
danke, fertig, milch, oma, trinken; two-hand: banane, kaffee.

| Attempt | One-hand | Two-hand | All |
| --- | --- | --- | --- |
| Other signers | 26.7% / 20.0% / 53.3% (15) | 14.3% / 0% / 85.7% (7) | 22.7% / 13.6% / 63.6% (22), top-3 10/22 |
| Same video, second pass | 66.7% / 0% / 33.3% (15) | 85.7% / 0% / 14.3% (7) | 72.7% / 0% / 27.3% (22) |

Left/right: 139 of 146 sightings agree (95.2%). The live fake camera gave 6.7 to 8.0 frames per
second (more tests run in parallel now), with a hand in about a third of the frames. These rates
are the same as before the adapter stopped removing single-frame hands.

**How much frame timing alone moves these** (`DGS_PHASES=0,0.25,0.5,0.75`, plain set, all 12
ordered pairs of passes taught and attempted): same-video top-1 63.6% to 77.3%, wrong concept 0%
to 4.5% (never more than 1 of 22); left/right per pass 94.7% to 98.8%.

What the numbers say:

- **Across signers the matcher is weak**: 8.1% top-1 against 3.7% by chance in the full set,
  and a wrong concept in about one attempt of six. Each word's two or three examples are other
  adults, often with another variant of the sign, in another framing. This is not the product's
  case (one child teaching and repeating its own gestures), but examples that differ as much as
  different signers do are not separated, and a wrong concept is then common, so the UI must
  confirm before speaking (recognition.md, "Known limits").
- **The same signing seen in other frames is recognised in about 60 to 75% of the attempts and
  spoken as a wrong concept in 2 of 86 (full set).** The misses are mostly `hands_unclear` (a
  second hand in view for a fifth to a half of the time), then `too_far` and `ambiguous`.
- The live-camera numbers in the first version of this card (same-video top-1 around 45%) were
  lower because the live pipeline dropped frames unevenly; they are superseded by these.
- No limit of the matcher was changed for these numbers.

### What the DGS test asserts, and how each bar was derived

On one machine the DGS numbers are now the same in every run, so a bar cannot flip by chance
there. The margins are for another machine, where the tracker's arithmetic may differ slightly;
each bar sits well below the lowest value seen over all frame timings measured (the four phases
above), so that a change as large as moving every frame by a quarter of a frame interval still
passes.

- **Pipeline**: every frame handed in comes back tracked, with its size; pose ran in every video;
  a hand is seen in at least 90% of the videos (one SignDict video never shows one); at least one
  word is measured as one-hand and one as two-hand; in no frame do both slots hold the same hand;
  no request leaves the app's origin. The live fake camera delivers at least 3 frames per second
  (measured 8.0 to 9.5) with a hand in some of them.
- **Reproducible frames**: the same video tracked again in a fresh browser gives identical
  landmarks; the adapter, feature builder and matcher give identical answers for the same frames.
- **Left/right**: at least 100 hand sightings with pose, and at least **85%** agree with the pose
  model's wrists. Lowest per-pass value over the four phases 94.7%, CI set 95.2%, full set 95.4%;
  the bar is 10 points under the lowest. The earlier bar of 90% on the live camera was wrong: on
  about 50 sightings that changed with the machine's timing it was within the run-to-run spread
  (89.4% to 100%), so it flipped.
- **Same video, second pass**: top-1 at least **40%** (lowest of the 12 phase pairs 63.6%; full
  set 59.3%; 2.8 times chance in the plain set) and wrong concept at most **20%** (highest 4.5%,
  1 of 22; full set 2.3%). The earlier "twice chance" bar (28.6%) was measured on the live camera,
  where top-1 ranged 27.3% to 45.5%, and flipped; it was wrong for that set-up.
- **Other signers: nothing is asserted.** Top-1 is above chance in these runs (8.1% against
  3.7%; 22.7% against 14.3%), but with 22 attempts in the plain set the margin is three attempts,
  and a ceiling on wrong concepts would only encode today's numbers. They are printed for the
  record.

### Time

The plain browser test (`npm run test:browser`) takes about 140 s locally (board, camera and
leaving tests about 35 s, DGS about 100 s: 22 videos with two passes each in three browsers, the
repeat of one video and the live fake camera); all of `npm run verify` about 160 s. The full set
took 13 min. A CI runner is slower; the job's time limit was raised from 10 to 20 minutes.

### Running it

- Locally: `npm run verify` (needs `origin/main_old` fetched, Git LFS, ffmpeg and Playwright's
  Chromium). Without `origin/main_old` (an exported copy without Git history) the DGS test is
  skipped with that reason; under `CI=true` it fails instead. `DGS_FULL=1 npm run test:browser`
  for the full set; `DGS_PARALLEL=<n>` browsers at once (default 3; the results do not depend on
  it); `DGS_PHASES=0,0.25,0.5,0.75` tracks four passes and prints every taught/attempted pair.
- CI (`.github/workflows/ci.yml`) fetches `main_old` with depth 1 (the checkout fetches only the
  tested commit), installs Chromium with `npx playwright install --with-deps chromium`, installs
  ffmpeg if the runner lacks it, and runs `npm run verify` on Node 22 and 24. The LFS videos are
  downloaded anonymously from GitHub's LFS storage (about 4 MB per run), which counts against the
  repository's LFS bandwidth.
- `DGS_FRAMES_OUT=<file>` writes the tracked frames, `DGS_FRAMES_IN=<file>` evaluates
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
- **A second tab runs its own capture**: its own camera request, worker and models in memory, and
  it may delete a tracker cache the other tab is still filling (the other tab's next start
  downloads again). Nothing coordinates tabs yet (follow-up).
- The camera test entry is reached only by its address. Teaching has its entry in the caregiver area
  (card NG-19); recognising has "Gebärde" on the child's board when the profile has examples
  (card NG-20, [recognise.md](recognise.md)).
- The browser test does not drive the teaching view; it was tried once by hand (card NG-19, see
  caregiver.md, "Verification status").
- The live fake camera reached 8 to 9.5 frames per second on the desktop VM (camera frame, bitmap,
  worker round trip with pose on every fifth frame); not a phone number. The DGS rates are
  measured at a fixed 10 frames per second of video instead.
- The DGS numbers are reproducible on one machine. Another CPU may run the tracker's arithmetic
  slightly differently (other SIMD kernels), which can change some landmarks; the bars below have
  margins for that, but CI on GitHub's runners has not been run from here.
