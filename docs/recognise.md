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
  and tracker, made-up tracker hands, and the real feature builder and matcher; that it asks for
  its own camera (card NG-49: front unless switched in the view), never teaching's stored choice,
  with the capture module's own bridge on a fake camera and one stand-in storage holding "hinten"
  for teaching.
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
and teaching (card NG-42, [capture.md](capture.md), "Live preview"): the camera's picture with the
points over it, or the points alone after "Bild aus" (cards NG-49 and NG-52, below); mirrored like
a mirror for the front camera, each tracked hand drawn as its 21 points and bones, the child's own left
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
before: the count in its own line and no picture. Since card NG-45 this also holds when the
preview's `show` throws (the view wraps the sink, drops and closes the preview) and when a later
start's `createPreview` throws after an earlier start had a picture (the old preview is
forgotten first); both are tested. Nothing of the picture is kept, copied or sent.
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

**Feedback without reading** (card NG-45; owner: "something useful with nice UI / UX for children
with special needs"). Under the picture, in the countdown and the recording, one row
(`.recognise-feedback`, the same element in both, so nothing moves) shows two things a child can
see without reading:

- **Hands seen:** two hand symbols (✋), lit for each hand the camera sees and grey otherwise, with
  the words "Keine Hand im Bild", "Eine Hand im Bild" or "Zwei Hände im Bild" for a caregiver
  (`RECOGNISE_TEXT.seen`). The row and a frame drawn over the picture are orange (#b35400)
  without a hand and green (#1d6b40) with one or two. Hands are counted as the preview draws them
  (`handsSeen`: the usable hands of `toLandmarkFrame`), on every tracked frame, without a redraw
  (`RecogniserOptions.onSeen`); a new attempt starts at "Keine Hand". Without a preview (an older
  bridge) the row is there all the same.
- **Time left:** five dots (`RECOGNISE_SECONDS`, one per second of `RECOGNISE_MAX_RECORDING_MS`).
  In the countdown all are lit (this is the time you will have); in the recording one goes out
  each second (`onTimeLeft`, a once-a-second tick of the controller that is cancelled with the
  camera). The dots change in steps, with no transition or animation, for children who are
  bothered by motion; their accessible name is "Noch 5 Sekunden" … "Noch 1 Sekunde". The ticks
  do not redraw the view, so they never reset the press guard of "Stopp".
- **Steady, not restless** (card NG-46): the tracker can lose a hand for single frames. A lower
  count is shown only after it held for `SEEN_HOLD_MS` (300 ms); a higher one at once. So a hand
  that flickers out of the tracker for a frame or two never switches the frame between green and
  orange. The hold ends on the highest count of the frames during it, never on a single frame:
  from two hands to one, an empty frame just as the hold ends does not flash "no hand" (it starts
  its own hold; a first review found this case). The seconds are derived from the recording's deadline (`now()` at its start plus
  `RECOGNISE_MAX_RECORDING_MS`), and the next tick wakes at the next whole second before it: a
  timer that fires late shows the count of the time actually left instead of falling one step
  behind per tick. Tested with a hand lost for single frames, a lasting drop, and a timer that
  fires 900 ms late.
- **The focus stays in the view** (card NG-48): each state draws its buttons anew. When the
  focused button or candidate goes with a redraw ("Stopp", "Nochmal", "Nein", a candidate pressed
  by keyboard or switch), the focus moves to the new state's first button, or to the first
  candidate, or to "Zurück zur Tafel"; it never drops to the page. Focus that was not lost is not
  moved. The test of late timers now checks 3.9 s, where a count per callback would fall behind.
- **Heard, not only seen** (card NG-47): the words next to the hand symbols ("Eine Hand im Bild")
  are a polite, atomic status region that stays in the page through countdown and recording (each
  draw leaves the nodes that are already in place where they are, so neither the region, the
  picture's box nor the picture in it is taken out and in again; a first review found the row
  moved on each tick, a second one the picture inside its box). They
  follow the steady signal and are only rewritten when the shown count changes, so a screen reader
  says when a hand comes into or leaves the picture, not on every frame. The seconds are not a live
  region: the line above already speaks the countdown, and a voice every second would cover it.

Measured in headless Chromium (as above, synthetic tracker frames, two hands): no page scroll and
nothing outside the window; picture and row keep their boxes from the countdown into the
recording; at 320 and 360 px wide the dots wrap under the hands:

| Window | Picture | Feedback row | Stopp |
| --- | --- | --- | --- |
| 320x480 | 20, 132, 279x183 | 20, 321, 279x54 | 20, 381, 279x80 |
| 360x640 | 20, 169, 319x272 | 20, 448, 319x54 | 20, 509, 319x112 |
| 640x360 | 20, 133, 353x165 | 20, 304, 353x37 | 380, 104, 240x237 |
| 844x390 | 20, 135, 476x193 | 20, 334, 476x37 | 502, 104, 321x267 |
| 820x1180 | 20, 187, 779x803 | 20, 996, 779x45 | 20, 1049, 779x112 |

The picture is smaller than with card NG-44 alone (the row takes 37 to 54 px). Not tried: a child,
a device, whether the symbols and colours are understood without explanation, and colour-blind
children (orange and green also differ in the number of lit hands, which carries the meaning on
its own).

**Front or back camera, and no camera picture** (card NG-49; owner request 2026-11-24: a child
films itself, or a caregiver films the child). This revises the NG-43 decision below.

- **The switch.** "⇄ Kamera: vorne / hinten" sits next to "Zurück zur Tafel" while the camera
  starts or runs, and after a camera problem. It is hidden with an answer, when the camera is off.
  - A tap starts the attempt again with the other camera: a new countdown, and nothing of the old
    camera is kept or compared.
  - A press within `RECOGNISE_GUARD_MS` after the camera was asked for does nothing: the second
    tap of "Gebärde" must not switch.
  - Its accessible name is "Kamera wechseln, jetzt vorne" (or "hinten").
- **The choice.** It is remembered on the device in `localStorage` under
  `amysecho-recognise-facing` (`RECOGNISE_FACING_KEY`), with the front camera as the default.
  - The key is apart from teaching's `amysecho-camera-facing`, which this view still never reads:
    a parent who teaches with "hinten" does not leave a child alone with the back camera.
  - Like teaching's choice it is a convenience, not data: every read and write is guarded, and a
    storage that refuses it keeps the choice until the page is left.
- **A camera that does not open** is not replaced by the other one (`fallback: false`).
  - A back camera that is missing or busy says "Die Kamera hinten geht gerade nicht. Oben auf
    „Kamera“ tippen für die Kamera vorne." The switch stays, so one tap goes back to the front.
  - The front camera keeps the capture's own lines.
- **No camera picture.** The view asks the bridge for a preview without video
  (`createPreview(document, { video: false })`, [capture.md](capture.md)).
  - Only the tracked hands (L/R) and the shoulders are drawn, on the box's calm dark background.
    The stream is never put into a visible `<video>`, so nobody and no room is on screen.
  - The drawing is mirrored for the front camera only, as in a photo app for the back one.
  - Teaching and the camera test keep their video.
- **Measured in headless Chromium**, with the real stylesheet, board and view, synthetic tracker
  frames and Chromium's fake camera: at 320x480, 360x640, 640x360, 844x390 and 820x1180, in the
  countdown, the recording and the countdown after switching to "hinten":
  - no page scroll and nothing outside the window;
  - no `<video>` in the view;
  - the switch is as high as "Zurück zur Tafel" (80 px, 112 px from 360x640) and from 126 px wide
    at 320 px, where its words wrap.
- **Tested:** the switch in the countdown and in the recording, with the recording dropped; the
  press guard; no switch with an answer; the choice remembered and apart from teaching's; a
  missing back camera; the preview asked for without video. Each test fails when its change is
  undone.
- **Not checked on a device:** whether the back camera of real phones opens with
  `facingMode: { exact: "environment" }`; whether a child finds the switch or presses it by
  mistake; whether children recognise themselves in the points without the picture.

**Continuous recognition, recognised gestures stacked** (card NG-54; owner request 2026-11-24).
In the app the gesture view no longer counts down to one attempt: it listens while it is open.

- **Listening.** After "Gebärde" the camera starts, and the view says "Gebärden machen. Dazwischen
  die Hände kurz runter." The picture, the hands-seen row, the camera switch and "Bild an / aus"
  stay as before; the seconds are hidden, as there is no time limit.
- **Cutting.** Each gesture ends when the hands leave the picture for longer than `SEGMENT_GAP_MS`
  (700 ms), the "away" cut of card NG-53 ([recognition.md](recognition.md), "A continuous stream
  cut into gestures"); the "rest" cut failed its gate and is not used.
  - Each finished gesture is compared alone, exactly as one attempt (`analyseAttempt`).
  - Only frames not yet used are kept: the controller cuts its own buffer after each gesture, so
    nothing is compared twice and the buffer stays short.
- **"Fertig"** finishes the gesture still going on, for a child who cannot lower the hands. It
  counts after the press guard, like "Stopp".
- **Too long.** A movement longer than `SEGMENT_MAX_MS` (10 s), finished or still going on, is let
  go, and the line says "Das war zu lang. Hände kurz runter, dann neu." What is left of it goes
  too, until the hands leave the picture; it is never compared as a gesture of its own.
- **Stacked tiles.** A match of the board is stacked as a tile under the hands-seen row, newest
  first (the top of the stack, always in view; the row scrolls sideways when full), at most
  `MAX_TAKEN` (6). The same concept again goes to the top. Anything else, an
  unknown movement or a concept not on the board, adds nothing, and the child sees no error.
- **Nothing is spoken without a tap.**
  - A tap on a stacked tile says only its word (`labelDe`, the device's local German voice), and
    the camera goes on.
  - A tile pressed within `RECOGNISE_GUARD_MS` of appearing does nothing, because a child may be
    reaching for something else just as it appears.
  - With exactly one tile, "Ja, sagen" (with the tile's picture) speaks its sentence through the
    board, as after one attempt, and the view closes.
- **When nobody uses it** (card NG-55): after `RECOGNISE_IDLE_MS` (3 minutes) without a hand in
  the picture, the camera stops. The view stays open ("Die Kamera ist aus. Weiter mit ▶."), and
  the stacked tiles stay too: they are the child's message, often waiting, hands in the lap, for
  someone to read it.
  - The tiles can still be tapped (a word), and "Ja, sagen" works with one tile.
  - "▶ Weiter" listens again with the same tiles.
  - A hand seen restarts the wait. A first version closed the view and lost the tiles; the review
    of the card found that, and the owner chose this instead.
  - With no tile taken there is nothing to keep: idle goes back to the board (card NG-63). A frame
    that cannot be converted counts as a frame without a hand, so idle comes also then.
  - The tiles are never lost on the way back:
    - A start that carried tiles ("Weiter", or a camera switch) and fails or is refused goes back
      to the pause with the tiles, and the line says why (the problem line, with "Weiter" where
      it names "Nochmal"). The camera failing while listening pauses with the tiles shown then.
    - Hiding the page while "Weiter" or a switch still starts the camera pauses with the tiles too.
    - The camera switch is shown in the pause too and listens again with the tiles.
    - Hiding the page (a screen lock, another app) stops the camera and pauses with the tiles;
      before, it closed the view. Device locks often come before the 3 minutes. A frame that
      arrives after the page was hidden but before its event pauses the same way (card NG-63).
    - Opening the caregiver area, or "Zurück zur Tafel", closes the view and ends the message.
- **No voice** (card NG-55): a tile tap that cannot be said shows the board's own lines, in the
  board's order. The tile stays, and the line goes with the next tile or a word said.
  - An empty voice list (the voices may still load) first gives "Keine Stimme. Bitte noch einmal
    tippen.", and at the second tap in a row "Keine deutsche Stimme. Hol eine Bezugsperson."
  - With no German voice at all: "Keine deutsche Stimme. Hol eine Bezugsperson."
  - When the voice reports a failure: "Vorlesen ging nicht. Bitte noch einmal tippen.", and at a
    second failure in a row "Vorlesen geht nicht. Hol eine Bezugsperson."
    Failures in a row end only when a word is said to its end, as on the board; a device reports
    a failure after the tap, and a test does the same.
  - A voice line belongs to the view it is shown in: the pause and a new listening start without it.
  - The counts of trouble in a row belong to the message: they carry across "Weiter" and a camera
    switch, and end only when the view goes back to the board (tested for both, card NG-63).
  - A report of an earlier tap (its word stopped by the next tap) changes nothing, as on the
    board; only the latest tap's failure or end counts (card NG-63).
  - When a tile's voice fails, the keyboard focus stays on that tile after the redraw, also in the
    pause, where it would otherwise move to "Weiter" (card NG-63).
- **A camera switch keeps the tiles** (card NG-55); any other start begins empty. The "zu lang" line
  goes once the hands have left the picture. Each frame is converted for the cut once, when it
  arrives, not again on every frame.
- **The attempt flow** (countdown, "Stopp", answer views) stays for `attachRecognise` without
  `continuous`; the app passes `continuous: true`.
- **Tested** (fake camera, synthetic hands):
  - each gesture is compared alone, with its own frames;
  - only matches of the board are stacked, at most six, a repeat moves to the end;
  - nothing is spoken;
  - "Fertig" and its guard work;
  - a too-long movement and its rest are let go;
  - a tile says its word after its guard, and one gesture gives its sentence;
  - "Zurück" stops the camera.
- **Measured in headless Chromium** (real stylesheet, board and view; six made-up movements, the
  hands out of view for 1 s between them; Chromium's fake camera) at 320x480, 360x640, 640x360,
  844x390 and 820x1180, listening with no tile, one and six tiles: no page scroll, nothing outside
  the window but the tile row's own sideways scroll. With tiles the picture shrinks: 145 px high at
  360x640, 89 px at 320x480, and only 53 px at 640x360 and 79 px at 844x390 (held sideways).
- **DGS videos** (test/browser/recognise.test.mjs; real tracker answers replayed, examples taught
  from the videos through the caregiver area): each word made in the continuous view and ended with
  "Fertig": 4 of 4 taught words stacked as the right tile, none as a wrong one; 2 of 2 untaught
  words stacked nothing; the sentence spoken only after "Ja, sagen", a word only after a tile tap.
  Six videos are not an evaluation; they show the flow end to end.
- **Not checked on a device:**
  - whether the picture is still useful held sideways with tiles (53 px high at 640x360);
  - whether children lower their hands between gestures;
  - how a hand that leaves slowly or half is cut;
  - the battery cost of a camera that runs while the view is open;
  - whether a word or a sentence is what a child wants from a stacked tile.

**Camera picture on or off** (card NG-52; owner feedback 2026-11-24: without the picture the view
looked oddly empty). The NG-49 points-only view above became a choice, and the picture is back by
default.

- **The toggle.** "◐ Bild aus" / "◐ Bild an" sits in the top corner of the picture box while the
  camera runs. Its words say what a tap does; its accessible name stays "Kamerabild" and
  `aria-pressed` says whether the picture is shown. It is at least 44 px; it is a caregiver's control, the
  child's targets keep `--tile-min`.
- **What a tap does.** It calls the preview's `setVideo`: the camera picture is shown or hidden
  under the same canvas. The camera, the tracker and the attempt go on: no restart, no frame lost
  (tested: a recording with the picture switched off and on in its middle is compared whole).
- **The choice** is remembered on the device under `amysecho-recognise-picture` ("off" for points
  only; anything else, nothing or no storage means on), and the next camera start asks the bridge
  for the preview with or without video.
- **Focus.** A focused toggle that goes with the picture (an answer, a problem) hands the focus on
  as in card NG-48.
- **Measured in headless Chromium** (as above, Chromium's fake camera) at the five sizes, in the
  countdown, the recording and the recording after "Bild aus": no page scroll, nothing outside the
  window, the picture box unchanged; one `<video>` with the picture on, none with it off; the
  toggle 92 to 120 px wide and 44 px high.

**Always the front camera** (card NG-43, revised by NG-49 above). The view had **no camera control** and did **not** use
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

## Vormachen (card NG-56)

When concepts on the board have a caregiver's demo clip ([caregiver.md](caregiver.md), "Vormachen"),
the app reads their ids with the board (`listDemoClipIds`, data names only) and the view's top row has
"Vormachen" (▷) after the camera switch. Without a clip the top row is as before. A clip itself is
read only when it is played; a failed listing is reported and the view has no "Vormachen".

- A tap opens a box above the view's content: "Welche Gebärde vormachen?" with the concepts that
  have a clip, in board order, as tiles, and "Schließen". With one clip it plays at once.
- A tap on any control of the box consumes the panel's press time, so a later key press on a
  guarded button ("Ja, sagen" and the others) is measured from itself, not from that tap (card
  NG-60). On a playback error the box keeps its status line in place and only swaps the clip and
  its buttons for "Schließen".
- The chosen clip plays in the box, muted and inline, under its label, with "Nochmal" (from the
  start), "Langsam" (half speed) and "Spiegeln" (shown like a mirror); both switches show
  `aria-pressed` and are remembered on the device (`amysecho-demo-slow`, `amysecho-demo-mirror`),
  off unless chosen. A clip that cannot be read, or that this browser cannot play (card NG-59: one
  recorded on another device; the video's error event), says "Dieser Clip kann gerade nicht
  abgespielt werden." with only "Schließen", which gets the focus if a clip button had it.
- Nothing in the box changes the recogniser: the camera runs on, the child imitates the clip and the
  recognised gesture is stacked as ever. No score, no praise, nothing spoken by the clip.
- "Schließen" puts the focus back on "Vormachen"; going back to the board closes the box and pauses
  the clip.
- Layout: in a window held upright the box sits above the content and the child's own picture keeps
  at least 5 rem; in a wide window the box is on the left, the content on the right. Looked at in
  headless Chromium at 390 x 844, 360 x 640 and 844 x 390 with Chromium's synthetic camera; not on a
  device, not with a child.
- The page's policy allows `media-src 'self' data:` for this; `test/browser/demo-clips.test.mjs`
  records a clip from Chromium's fake camera and plays it under that policy.

## Not in scope now (follow-ups)

- **Saving a chosen candidate as a new example** (the card's "correction becomes a new example"):
  in the caregiver flow, never on the child's screen without a caregiver.
- **Cancelling the last spoken message.**
- **A cooldown** against speaking the same gesture twice in a row within a short time.
- **A profile setting for who confirms** (the child or a caregiver). Today the child confirms.
- Measuring the gesture view with larger text, and on a device.
- Trying the flow, the countdown, the 5 s limit and both guard times with a child.
