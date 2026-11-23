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
  and tracker, made-up tracker hands, and the real feature builder and matcher.
- Tested in headless Chromium (Playwright) with DGS sign videos of adult signers fed into the
  app's capture path through the board's own flow (below).
- **Not tested:** a real camera, a phone or tablet, a child, a screen reader, real speech, an
  emoji font on the target device (the control's hand symbol is the character ✋). The layout of
  the gesture view was not measured in a browser at the five window sizes of
  [board.md](board.md); only its rules are checked as text.

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
   `RECOGNISE_COUNTDOWN_S`), with the number large. Frames of this time are not kept: the hand
   that tapped leaves the picture.
3. **Recording**: "Jetzt die Gebärde machen." and one button "Stopp". The attempt ends on "Stopp"
   or after `RECOGNISE_MAX_RECORDING_MS` (5 s). The camera stops then, whatever the answer.
   ("Stopp", not "Fertig": "Fertig" is a concept on the board.)
4. **The answer** (`analyseAttempt`: `sequenceFromRecording`, then `matchGesture` with limits
   calibrated from the profile's examples, `DEFAULT_MIN_MARGIN`). One-hand and two-hand attempts
   are compared only with examples of their own kind and anchor (matcher rules); an attempt of
   another kind than every example is `unknown` (`other_hands`) without candidates.
   - **Match**: "Meinst du das?", the concept's symbol (or its text when it has none) large with
     its label, and two buttons "Nein" and "Ja, sagen". **Only "Ja, sagen" speaks**: the view
     closes, then the board does exactly what a tap on that tile does (`MountedBoard.say`: select,
     sentence bar, the speech path with its no-voice and failure lines, the rule for a sentence
     that is still being spoken). "Nein" and "Zurück zur Tafel" return to the board silently.
   - **Unknown** (`too_far`, `ambiguous`, `other_hands`, `other_anchor`): "Das habe ich nicht
     verstanden." Nothing is spoken. Up to three candidates (`MAX_CANDIDATES`), the matcher's
     ranking (`rankConcepts`) limited to concepts on the board, are shown as tiles under
     "Vielleicht eins davon?"; a tap on one closes the view and speaks it like its tile. The way
     back is "Zurück zur Tafel".
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

   - **Camera problem** (no bridge: "Die Kamera kann gerade nicht starten. Die Tafel funktioniert
     auch ohne Kamera."; otherwise the capture's German message for a refused or missing camera,
     the tracker download, a failing camera): the line, "Nochmal" and "Zurück zur Tafel".

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
- **The board** ignores taps on tiles, the sentence bar and "Gebärde" for `BOARD_SHIELD_MS`
  (700 ms) after the view closed: the tiles appear where the view's buttons were. The speech of
  "Ja, sagen" or a candidate goes past this shield.
- "Ja, sagen" speaks once: the view is gone before the board speaks, so a second tap finds nothing
  to confirm. Both values are guesses, not tried with a child.
- Within one view nothing moves: "Zurück zur Tafel" keeps its place, the button row keeps its
  height (`min-height: var(--tile-min)`) also when it is empty. All buttons of the view are at
  least `--tile-min` high; candidates are a row of tiles of at least that height.

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
- **Attempted through the board**: a click on "Gebärde"; the capture bridge the board looks up is
  replaced in the page by one that runs the app's `startCapture` with the real tracker, only the
  camera replaced; when the view says it records, the frames of the video (the second pass, half a
  frame later: the same signing seen in other frames) are fed in, then "Stopp" is clicked. Also two
  videos of words that were not taught (`danke_var_danke_2`, `oma_main_oma`).
- Speech is observed through a stand-in engine in the page (headless Chromium has no German voice)
  and the sentence bar.
- Asserted: at least one attempt is recognised and "Ja, sagen" speaks exactly its sentence once,
  which the sentence bar then shows; "Nein" is pressed at least once and speaks nothing (on a
  second recognised attempt, or on a repeat of the first); no attempt speaks before a confirming
  tap; unknown and refused attempts speak nothing; a candidate speaks like its tile; the camera is
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
spoken: once after "Ja, sagen", once after a candidate; "Nein" pressed three times. One of the
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
- Measuring the gesture view at the five window sizes of [board.md](board.md), and with larger text.
- A live line in the view (how many hands are seen) while recording.
- Trying the flow, the countdown, the 5 s limit and both guard times with a child.
