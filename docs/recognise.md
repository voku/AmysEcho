# Recognising a gesture on the board

Card NG-20. The child taps "Gebärde" on the board, makes a gesture, and the app shows what it
understood. **Nothing is spoken without a confirming tap**: the matcher accepts look-alike
movements ([recognition.md](recognition.md), "Known limits"), and across signers it names a wrong
concept in about one attempt of six ([capture.md](capture.md), "Measured"). Speaking a wrong word
is the worst failure, so a match is only a question to the child.

Code: `src/recognise/recognise.ts` (`createRecogniser`, the controller without DOM;
`attachRecognise`, the view; `analyseAttempt`), the control and the press shield in `src/board.ts`
(`BoardOptions.gesture`, `MountedBoard`), the wiring in `src/app.ts`, the look in
`public/styles.css`. Tests: `test/recognise.test.mjs`, `test/board.test.mjs` (the tests named
"gesture: …"), `test/app.test.mjs`, `test/browser/recognise.test.mjs`.

## Status

- Tested in Node against a fake document, the real capture path (`startCapture`) on a fake camera
  and tracker, made-up tracker hands, and the real feature builder and matcher; that it always asks
  for the front camera (card NG-43), with the capture module's own bridge on a fake camera and a
  stand-in storage holding "hinten".
- Tested in headless Chromium (Playwright) with DGS sign videos of adult signers fed into the
  app's capture path through the board's own flow (below).
- **Not tested:** a real camera, a phone or tablet, a child, a screen reader, real speech, an
  emoji font on the target device (the control's hand symbol is the character ✋; the view's
  button symbols ✓ ✗ ■ ↻ are plain characters), larger text. The layout of every state of the
  view was measured in headless Chromium at five window sizes ("Layout", below).

## When the control is there

The app (`createApp`) reads the active profile's examples together with its board, on every start
and every refresh, so the control is there when the board is drawn and nothing moves later:

- only on a profile's own board (never on a board of examples), and only when the profile has at
  least one readable example (`listExamples`) of a concept that is on this board. Examples of
  concepts that are not on the board, and damaged examples, are not used;
- a failed read of the examples is reported and the board is drawn without the control;
- without such examples **the board is exactly as before** (tested: the same children in the same
  order, no trace of "Gebärde");
- the caregiver area refreshes the board when it closes, so examples taught or deleted there, a
  changed board and another active profile count from then on.

The control is one wide button between the notice lines and the tiles: a raised hand (✋) and
"Gebärde", `min-height: var(--tile-min)`, purple, unlike a tile. If the gesture view cannot be
attached, the board is drawn without the control and the error is reported.

## The flow

1. **"Gebärde"**. The board is covered by the gesture view: a frame of its own colour (6 px purple
   border, light purple background), "Zurück zur Tafel" at the top, the state in the middle, the
   state's buttons at the bottom. The board's own content (sentence bar, notices, tiles) is hidden
   meanwhile, not removed. Only now the camera starts, through the capture module's bridge
   (`globalThis.amysEchoCapture`, as teaching does, [capture.md](capture.md)); the hidden video
   element goes into the view. While the tracker loads and the camera is asked for, the view
   shows the capture's own line ("Die Handerkennung wird vorbereitet …", "Bitte die Kamera
   erlauben.").
2. **Countdown**: "Gleich geht’s los: 3", "… 3 … 2", "… 3 … 2 … 1" (one second each,
   `RECOGNISE_COUNTDOWN_S`), with the number large (over the live picture, below). Frames of this
   time are not kept: the hand that tapped leaves the picture.
3. **Recording**: "Jetzt die Gebärde machen.", the live picture and one button "Stopp". The attempt ends on "Stopp"
   or after `RECOGNISE_MAX_RECORDING_MS` (5 s). The camera stops then, whatever the answer.
   ("Stopp", not "Fertig": "Fertig" is a concept on the board.)
4. **The answer** (`analyseAttempt`: `sequenceFromRecording`, then `matchGesture` with limits
   calibrated from the profile's examples, `DEFAULT_MIN_MARGIN`). One-hand and two-hand attempts
   are compared only with examples of their own kind and anchor (matcher rules); an attempt of
   another kind than every example is `unknown` (`other_hands`) without candidates.
   - **Match**: "Meinst du das?", the concept's symbol (or its text when it has none) large with
     its label, and two buttons "✗ Nein" and "✓ [picture] Ja, sagen": a cross, and a check mark
     with the concept's picture small, so a child who does not read sees what will be said; the
     text stays. "Nein" is left (wide windows: upper), "Ja, sagen" right (lower), always.
     **Only "Ja, sagen" speaks**: the view
     closes, then the board does exactly what a tap on that tile does (`MountedBoard.say`: select,
     sentence bar, the speech path with its no-voice and failure lines, the rule for a sentence
     that is still being spoken). "Nein" and "Zurück zur Tafel" return to the board silently.
   - **Unknown** (`too_far`, `ambiguous`, `other_hands`, `other_anchor`): "Das habe ich nicht
     verstanden." Nothing is spoken. Up to three candidates (`MAX_CANDIDATES`), the matcher's
     ranking (`rankConcepts`) limited to concepts on the board, are shown as tiles under
     "Vielleicht eins davon?". **A tap on a candidate speaks nothing**: it opens the same confirm
     view for that concept ("Meinst du das?", "Nein" / "Ja, sagen"); only "Ja, sagen" speaks it,
     like its tile. "Nein" there goes back to the candidates (the child was choosing among them;
     "Zurück zur Tafel" is always there for the board). So nothing is ever spoken from the view
     without the confirming "Ja, sagen".
   - **Unusable recording**: a short reason, "Nochmal" (a new attempt, the camera starts again)
     and "Zurück zur Tafel":

     | Feature builder | Line |
     | --- | --- |
     | `no_frames` | Die Kamera hat kein Bild geschickt. |
     | `bad_timestamps`, `bad_landmarks` | Die Aufnahme hat nicht geklappt. |
     | `no_hands` | Ich habe keine Hand gesehen. |
     | `too_short` | Das war zu kurz. |
     | `hands_unclear` | Ich konnte die Hände nicht gut sehen. |
     | `hand_lost` | Eine Hand war zu lange weg. |

   - **Camera problem**: one short line of this view's own (`RECOGNISE_TEXT.problems`; the
     capture's texts name "Kamera starten", which this view does not have), "↻ Nochmal" and
     "Zurück zur Tafel". For example: no bridge "Die Kamera kann gerade nicht starten. Die Tafel
     geht auch ohne Kamera."; first use offline "Die Handerkennung braucht beim ersten Mal
     Internet. Mit Internet „Nochmal“ tippen."; refused "Die Kamera ist nicht erlaubt. Eine
     Bezugsperson kann sie in den Einstellungen erlauben."

**Live picture with the detected hands** (card NG-44; owner request 2026-11-23: whoever makes
the gesture, the child or a caregiver beside it, should see where the gesture is captured). While
the camera runs, in the countdown and the recording, the view shows the preview of the camera test
and teaching (card NG-42, [capture.md](capture.md), "Live preview"): the front camera's picture
mirrored like a mirror, each tracked hand drawn as its 21 points and bones, the child's own left
hand orange with "L", the right one cyan with "R", and the shoulders as a yellow line. Without a
hand in the picture nothing is drawn over it, so an empty picture says "no hand seen". The view
asks the bridge for one preview per camera start (`createPreview`, passed to `start` as
`preview`); the capture draws every tracked frame on it, including the countdown's, which are
still not kept. The picture sits under the state's line in one box (`.recognise-preview`) that
keeps its size and place from the countdown into the recording; the countdown's number is drawn
large over it (white with a dark outline). In a wide window the empty button column stays during
the countdown, so the picture does not widen and shrink again. After the attempt (confirm,
unknown, unusable), on a camera problem and on every way out the camera stops, the capture closes
the preview (the controller closes it too, also when the start was cancelled before the camera
opened) and the box is emptied: no picture is shown with an answer. A bridge without
`createPreview` (an older one, or the browser test's) or a preview that fails leaves the view as
before: the count in its own line and no picture. Nothing of the picture is kept, copied or sent.
Tested in `test/recognise.test.mjs` ("preview: …") with a recording preview on the real capture
path. Measured in headless Chromium (the real stylesheet, board and view, the real
`createCapturePreview` on Chromium's fake camera, synthetic tracker frames), no page scroll and
nothing outside the window in either state; the picture's box is the same in the countdown and
the recording:

| Window | Back | Picture (countdown and recording) | Stopp |
| --- | --- | --- | --- |
| 320x480 | 20, 18, 279x80 | 20, 132, 279x243 | 20, 381, 279x80 |
| 360x640 | 20, 20, 319x112 | 20, 169, 319x332 | 20, 509, 319x112 |
| 640x360 | 20, 18, 599x80 | 20, 133, 353x208 | 380, 104, 240x237 |
| 844x390 | 20, 18, 803x80 | 20, 135, 476x236 | 502, 104, 321x267 |
| 820x1180 | 20, 20, 779x112 | 20, 187, 779x854 | 20, 1049, 779x112 |

(x, y, then width x height in CSS pixels. The picture is fitted whole into the box, `contain`,
with dark bars where the box's shape differs from the camera's.) Not tried: a real camera, a
phone, a child; whether the picture distracts a child from the gesture, or helps it, is a question
for the trial.

**Always the front camera** (card NG-43). The view has **no camera control** and does **not** use
the "Kamera: vorne / hinten" choice of teaching and the camera test: it asks the bridge for the
front camera itself (`facing: "user"`, `fallback: false`). Reason (second build, coordinator's
decision delegated by the owner): the child uses the board alone, facing the screen, and only the
front camera sees the child there. A parent who taught with "hinten" leaves that choice stored;
used here, it would point the back camera away from the child, every attempt would end in "no
hands", and the child would get no explanation and no way out. For the same reason a front camera
that is missing or does not open is not replaced by the back one: the view shows its camera
problem line ("Die Kamera ist gerade besetzt. …", "Es wurde keine Kamera gefunden.") with
"Nochmal" and "Zurück zur Tafel", as before. Examples taught with the back camera still match
attempts made here: both cameras look at the child and give the same frames
([capture.md](capture.md), "Handedness"); tested with examples recorded through the back camera
and an attempt through the front one. Measured in headless Chromium (first build, the real
stylesheet, board and view on a fake camera) with "vorne" and with "hinten" stored: every state
(countdown, recording, unusable) had the same boxes, to the pixel, no page scroll; the view
itself is unchanged by this card:

| Window | Back | Count (countdown) | Stopp / Nochmal |
| --- | --- | --- | --- |
| 360x640 | 20, 20, 319x112 | 156, 272 | 20, 454, 319x112 |
| 640x360 | 20, 18, 599x80 | 296, 176 | 380, 104, 240x186 |

(x, y, then width x height in CSS pixels.) In the Node tests the view's whole tree is compared in
seven states with either stored choice and is the same, and the camera asked for is the front one.

**Ways out, and the camera.** The camera is stopped (the capture's cancel signal and `stop()`) on
"Zurück zur Tafel" at every step (tracker loading, permission asked, countdown, recording), after
each attempt, when the page is hidden (`visibilitychange`) or left (`pagehide`), when the board
region is hidden (the caregiver area opened; checked on each camera frame and countdown tick), and
when the board is replaced (a refresh, start-up, the last-resort line). Nothing is stored and
nothing is sent: the tracked frames of one attempt are kept in memory until they are compared, and
no picture is ever kept ([capture.md](capture.md)).

## Press safety

- **The view's buttons** ignore a press that began before the view appeared or less than
  `RECOGNISE_GUARD_MS` (700 ms) after it ("Ja, sagen" appears where "Stopp" was; the second tap of
  a double tap must not confirm). A press counts from its `pointerdown`; a key press from its
  click. "Zurück zur Tafel" is never guarded and never moves: the way back always works.
- **The board** ignores taps on tiles and the sentence bar for `BOARD_SHIELD_MS` (700 ms) after
  the view closed: the tiles appear where the view's buttons were. "Gebärde" is shielded longer,
  `GESTURE_SHIELD_MS` (1.5 s): a slow double tap on "Zurück zur Tafel" can come down on it a
  second later and would start the camera again. The speech of "Ja, sagen" goes past these
  shields.
- "Ja, sagen" speaks once: the view is gone before the board speaks, so a second tap finds nothing
  to confirm. A candidate's confirm view is a new view with its own guard. All three times are
  guesses, not tried with a child.
- Within one view nothing moves: "Zurück zur Tafel" keeps its place, the button row keeps its
  height (`min-height: var(--tile-min)`) also when it is empty. All buttons of the view are at
  least `--tile-min` high; candidates are a row of tiles of at least that height.

## Layout

The view is one framed column: "Zurück zur Tafel" across the top, then the state's content and its
buttons, one above the other in a window held upright and side by side in a wide one
(`orientation: landscape`: content left, buttons stacked in the right 40 %). The content is
centred only where it fits (`justify-content: safe center`, no scrolling inside the view); the
concept's picture shrinks to the room left, its label, the buttons and the candidate tiles do not
(all at least `--tile-min` high, at least 44 px wide). Measured in headless Chromium, every state
(starting, countdown, recording, confirm, unknown with three candidates, the confirm view of a
candidate, unusable, problem), nothing off-screen or cut, no page scroll, no target below the
minimum:

| Window | `--tile-min` | Confirm tile (picture) | Nein / Ja, sagen | Candidates (3) | Back | Stopp, Nochmal |
| --- | --- | --- | --- | --- | --- | --- |
| 320x480 | 80 | 160x145 (96x96) | 136x80 each | 89x80 | 279x80 | 279x80 |
| 360x640 | 112 | 160x158 (108x108) | 156x112 each | 101x112 | 319x112 | 319x112 |
| 640x360 | 80 | 160x158 (107x107) | 240x90 each | 195x80 | 599x80 | 240x186 |
| 844x390 | 80 | 160x169 (117x117) | 321x105 each | 263x80 | 803x80 | 321x216 |
| 820x1180 | 112 | 260x293 (220x220) | 386x112 each | 254x112 | 779x112 | 779x112 |

(The first build centred an overflowing column: at 640x360 the question sat behind "Zurück" and
the tile showed a cut picture without its label.) Not measured: larger text, a device.

**Mute.** Speech goes only through the board's own path, so everything the board does about speech
holds here too: no local German voice, a failing engine, the muted bar. The app has no mute setting
of its own.

## The browser test

`test/browser/recognise.test.mjs`, part of `npm run test:browser`. It reads DGS videos from the
`main_old` history as `dgs-capture.test.mjs` does (Git LFS, ffmpeg, a temporary directory deleted
after use), skips with a reason when that history is missing and fails under `CI=true`.

- In the page a profile "Test" is created through the app's own store with the board "Trinken"
  (catalogue) and "Kaffee" (a custom concept); without examples the board has no control.
- **Taught**: two short videos each (`trinken_var_trinken_0`, `_1`; `trinken_var_kaffee_2`,
  `trinken_main_kaffee`, 1.5 to 3 s), tracked through the app's `startCapture` with the real
  tracker worker at fixed frames (10 per second of video, phase 0) and stored with `saveExample`.
  After a refresh the board shows "Gebärde".
- **Attempted through the board**: every pass of every video is first tracked once by the real
  tracker worker through the app's `startCapture`. A click on "Gebärde" then runs the board's own
  flow and the app's `startCapture`; during the recording only the camera and the tracker are
  replaced: the tracker replays what the real tracker answered for exactly these frames (the second
  pass, half a frame later: the same signing seen in other frames), and refuses a frame whose
  timestamp or pose flag is out of step. A replayed frame takes microseconds, so the 5 s limit
  cannot cut an attempt on a slow machine. Then "Stopp" is clicked; the test asserts that "Stopp"
  ended every recording, that no attempt ended in a problem view and that the replay never went out
  of step. Also two
  videos of words that were not taught (`danke_var_danke_2`, `oma_main_oma`).
- Speech is observed through a stand-in engine in the page (headless Chromium has no German voice)
  and the sentence bar.
- Asserted: at least one attempt is recognised and "Ja, sagen" speaks exactly its sentence once,
  which the sentence bar then shows; "Nein" is pressed at least once and speaks nothing (on a
  second recognised attempt, or on a repeat of the first); no attempt speaks before a confirming
  tap; unknown and refused attempts speak nothing; a candidate tap opens the confirm view and
  speaks nothing, and "Ja, sagen" there speaks it once (sentence bar too); the camera is
  stopped after every attempt; the examples taught include a one-hand and a two-hand one; no
  request leaves the origin; no page error.

Measured on the desktop VM (headless Chromium, CPU delegate, 2026-11-23), plain run of this test:

| Attempt | Taught as | Answer |
| --- | --- | --- |
| trinken_var_trinken_0 | one hand (right) | confirm "Trinken" (one-hand attempt) |
| trinken_var_trinken_1 | two hands | confirm "Trinken" (two-hand attempt) |
| trinken_var_kaffee_2 | two hands | confirm "Kaffee" |
| trinken_main_kaffee | two hands | confirm "Kaffee" |
| danke_var_danke_2 | not taught | unknown (`too_far`, two-hand attempt) |
| oma_main_oma | not taught | unknown (`too_far`, two-hand attempt) |

That is 4 of 4 taught attempts recognised, no wrong concept shown, both untaught words unknown;
spoken: once after "Ja, sagen" on a match, once after a candidate and "Ja, sagen"; "Nein" pressed
three times. One of the
"Trinken" videos is seen as a two-hand sign (the signer's other hand is in the picture), so
"Trinken" has a one-hand and a two-hand example, and each attempt matched the example of its own
kind. These are the same videos seen again in other frames, the easiest case
([capture.md](capture.md), "Same video, second pass"); they say that the board's flow works end to
end, not how well a child's gestures are recognised. The numbers of the run under
`npm run verify` are printed by the test.

**How the test differs from a live camera.** Frames are handed in only after the countdown and as
fast as the tracker takes them, so the recording holds exactly the video's frames. A live camera
delivers frames all the time and drops those the tracker cannot take. Tracking in the test is
slower than real time, so a long video could be cut by the 5 s limit; the test uses videos of at
most 3 s and prints how many recordings the limit cut: none when it ran alone, one of six (the
30-frame video, still recognised) in one run under `npm run verify`, where the DGS test tracks in
parallel. The test takes about 70 s, mostly tracking; `npm run verify` took 2 min 47 s.

## Not in scope now (follow-ups)

- **Saving a chosen candidate as a new example** (the card's "correction becomes a new example"):
  in the caregiver flow, never on the child's screen without a caregiver.
- **Cancelling the last spoken message.**
- **A cooldown** against speaking the same gesture twice in a row within a short time.
- **A profile setting for who confirms** (the child or a caregiver). Today the child confirms.
- Measuring the gesture view with larger text, and on a device.
- A live line in the view (how many hands are seen) while recording; the live picture (card NG-44)
  shows the hands, but says nothing in words.
- Trying the flow, the countdown, the 5 s limit and both guard times with a child.
