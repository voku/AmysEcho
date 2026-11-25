# Gesture recognition core

Code: `src/recognition/`. Board cards: NG-1, NG-18 for one and two hands, time and rest, and NG-19 for
stored examples. Product slice: S3 in [#1176](https://github.com/voku/AmysEcho/issues/1176). The camera
is card NG-3 ([capture.md](capture.md)); teaching examples in the caregiver area is card NG-19
([caregiver.md](caregiver.md)); recognising an attempt on the child's board, with a confirming tap before anything is spoken, is card NG-20 ([recognise.md](recognise.md)).

The hand-tracker decision, with what was measured and what only the phone can answer, is in
[tracker-decision.md](tracker-decision.md) (card NG-16).

## How it works

1. **Landmark frames in.** A capture is a list of frames with up to two hands (21 points each, in
   MediaPipe order) and, when visible, the two shoulders. See "Input contract" below.
2. **Feature sequence out** (`features.ts`, schema version 2). All times are milliseconds from
   the frames' timestamps, never frame counts, so the rules hold at 7 as at 30 frames per second.
   - **Which hands make the gesture** (`hands`: `left`, `right` or `both`) is decided over the
     whole time a hand is in view, from the first to the last frame with a hand, as by the
     matcher of schema version 1, never over a part cut out by movement. (In three earlier builds
     of card NG-18 it depended on the cut by movement, and each time reviewers found two-hand
     signs spoken as their one-hand twin where version 1 did not.) Presence decides, not which
     hand moves more. A hand belongs when it is visible for at least `HAND_PRESENCE_SHARE` (half)
     of that time, whether it moves or rests. In view for between a fifth (`HAND_BRIEF_SHARE`)
     and a half, nobody can tell, and dropping the hand could turn a two-hand gesture into the
     one-hand gesture with the same path: no sequence is built (`hands_unclear`). Neither hand in
     view for half: `hands_unclear`.
   - **A one-hand gesture needs more.** The other hand is dropped entirely, not interpolated in,
     only when all of this holds: it is in view for less than a fifth of the time; it is seen in
     one unbroken visit (no two sightings more than `MAX_BRIDGED_GAP_MS`, 500 ms, apart, and
     seen in at least half of the frames from its first to its last sighting); it does not get
     half of `MIN_TRAVEL` (below) away from where it was first seen while it is seen for
     `MIN_GESTURE_MS` (300 ms) or longer, however slowly; and, if it was in view at all, the hand
     that stays has a movement of its own. Otherwise `hands_unclear`: a hand that moved and left
     just before or after the gesture may be its first or last part, a hand seen in separate
     moments or scattered frames may be a hand of the gesture that the tracker keeps losing, and
     a hand that lies still is never matched because a hand next to it was seen for a moment.
   - **The tolerance for a second hand is a share of the capture, not a time.** A hand passing
     through without moving on its own as above is dropped if it is in view for under a fifth
     of the time a hand is in view: in a capture of 1.5 s that is up to 300 ms, in one of 0.6 s
     up to 120 ms. In the table below a hand passing for 250 ms therefore gives `unknown` for
     about half of the attempts, and a hand that passes for longer moves on its own and always
     gives `unknown`.
   - **What counts as a movement of its own** (for the rules above): the centre of the palm
     (wrist and finger bases, which stay in place when the fingers bend) travels at `REST_SPEED`
     (0.25 shoulder widths per second) or faster, measured over `SPEED_SPAN_MS` (200 ms); fast
     frames form one movement while the hand is not seen to be slow for more than
     `MOVEMENT_GAP_MS` (200 ms) between them; and the movement lasts `MIN_GESTURE_MS` (300 ms) and
     gets at least `MIN_TRAVEL` (0.1 shoulder widths) from where it started, on positions
     averaged over 200 ms. Movement decides nothing else.
   - **Nothing is trimmed.** The gesture is the whole time the hands that belong are in view,
     rest before and after included, as by the matcher of schema version 1. Earlier builds of
     card NG-18 cut rest away, first by movement, then by a resting pose (all 21 landmarks
     within a band, robust to single wrong frames). Each time reviewers found signs spoken as a
     wrong concept that version 1 did not speak (a sign without travel cut down to its rest by
     jitter or by one wrong frame; small travelling signs cut differently in examples and
     attempts), and in the synthetic evaluation below the trim gained nothing measurable. So it
     was taken out.
   - A hand that rests in view for the whole gesture therefore makes it a two-hand capture, with
     the resting hand's place and shape in the sequence. It is compared with examples that show
     two hands as well; see "Input contract".
   - **A hand that belongs and is lost for a moment** is filled in between the frames around the
     gap, in proportion to the time, up to `MAX_BRIDGED_GAP_MS` (500 ms between two sightings,
     whether the frames in between show no hand or no frames arrived at all). Before its first
     and after its last sighting it is missing (all zero), as in schema version 1: the build
     before this one held it where it was seen, and a caregiver's hand that reached in for half
     of the capture then looked like the held hand of a two-hand sign (table "Somebody's hand
     reaches in" below). A longer gap is not guessed over: no sequence is built (`hand_lost`).
   - Position, zoom and tilt of the camera are removed using the shoulders: those seen during
     the gesture, or else those seen anywhere in the capture. Without any shoulders the sequence
     is anchored to the centre of the hand movement and is only compared with other sequences
     anchored the same way.
   - The gesture is resampled to 32 steps evenly **in frame order**, as by the matcher of schema
     version 1, so its overall speed does not change it. An earlier build of card NG-18 spaced
     the steps evenly in time; on the synthetic captures that gained nothing at low or unsteady
     frame rates and let one more look-alike through (first table below), so it was taken back.
     A frame rate that changes within a capture therefore distorts the sequence.
   - **When no sequence is built** the caller answers "unknown". The reasons say what was seen,
     not what to do: `no_frames`, `bad_timestamps`, `bad_landmarks`, `no_hands` (frames, but no
     hand in any, also when shoulders are seen), `too_short` (a hand of the gesture in fewer than
     three frames, or all frames at one timestamp), `hands_unclear` and `hand_lost` (above).
3. **Comparison** (`dtw.ts`). Dynamic time warping gives the cost of the best alignment divided by
   the sequence length, so a gesture may be faster or slower in parts.
4. **Decision** (`matcher.ts`). The attempt is compared with the examples of one child profile.
   An attempt is only compared with examples of the same anchor **and the same hands**: a
   right-hand attempt is never measured against a left-hand or a two-hand example. The answer is
   a concept or `unknown`, with up to three closest concepts for a correction list. `unknown` has
   five reasons: `no_examples` (the profile is empty), `other_anchor` (examples exist, none with
   the attempt's anchor), `other_hands` (none made with the same hands), `too_far`, and
   `ambiguous` (two concepts about equally close). For the first three the correction list is
   empty. `other_hands` says only that the profile has no example made with the hands seen in
   this attempt (`hands` of the sequence); it does not say the child used the wrong hand. A hand
   resting in the lap in view of the camera is enough for it.
5. **Per-concept limits.** How far away an attempt may be is derived from how much that profile's
   own examples of that concept typically differ, separately for each kind of sequence (anchor
   and hands, `limitKey`): right-hand examples of a concept never widen the limit of its single
   two-hand example. A kind's limit is also never wider than the limit of the whole concept,
   computed as the matcher of schema version 1 does: each example's nearest sibling among the
   concept's examples with the same anchor (whatever hands they show), and the median over all
   examples of the concept, whatever their anchor. So examples of one kind can only make it
   stricter: two loose examples without shoulders do not open a concept that has tidy ones with
   shoulders. More examples can widen a concept
   up to an upper bound but never make it stricter than the fixed limit a single example gets.

There is no training step and no shared model. Adding an example changes the result immediately.

## Input contract

The matcher does not check these. The camera capture (card NG-3, [capture.md](capture.md)) produces its
frames through `src/recognition/tracker-adapter.ts`, which guarantees the first two and the
timestamps; how, and what is still unverified on a phone, is in capture.md.

- **Coordinates must have the same scale on both axes**, for example pixels. MediaPipe's normalised
  coordinates (0 to 1 on each axis) must first be multiplied by image width and height. In
  reviewer probes, stretching one axis by 16:9 on the attempts only dropped top-1 from 100% to 31%
  (vertical stretch) and to about 2% (horizontal stretch).
- **`left` and `right` must mean the same thing in every capture of a profile.** The convention
  is decided (card NG-16, [tracker-decision.md](tracker-decision.md)): `left` is the child's own
  left hand, and frames go to the tracker unflipped. Whether the phone's front camera delivers
  unflipped frames is not verified yet. In reviewer probes, mirrored attempts or swapped hand labels were rejected 100% of the
  time, and labels flickering on 10% of frames between a quarter and two fifths of the time,
  depending on how the flicker was simulated. The synthetic data never varies this.
- **Examples and attempts need the same anchor.** If shoulders are visible in the examples but not
  in an attempt (or the other way round), nothing is comparable: the answer is `unknown` with the
  reason `other_anchor` and an empty correction list. The rule itself is unchanged. Shoulders
  seen at any time in a capture anchor it. Between captures nothing is carried over: if the
  camera task (NG-3) wants a child whose shoulders are hidden for one attempt to stay
  comparable, it has to pass on the last shoulders it saw. Card NG-3 does not: each capture is
  anchored by the shoulders it saw itself, and the adapter has `shoulders: "never"` for a profile
  that uses the hands anchor throughout. Card NG-19 decided: teaching uses the default (`"auto"`),
  each stored example keeps the anchor it was recorded with, and the teaching view says when a
  recording had no shoulders and asks for them to be in the picture. A profile can therefore hold
  examples of both anchors; an attempt is compared only with those of its own anchor.
- **Frames carry timestamps in milliseconds that do not decrease.** The cut, the hand rules and
  the resampling all use them. 7 to 15 frames per second are enough for the rules; what low and
  unsteady rates cost is in the table below.
- **A gesture made with the left hand and the same gesture made with the right are different
  gestures.** `left` is the child's own left hand (above), so a child who uses either hand needs
  examples of both. Whether that is right for real children is a question for the first
  recordings (card NG-5).
- **Examples have to show the hands the attempts will show.** A one-hand gesture taught with the
  other hand out of the picture is `unknown` (`other_hands`) when the other hand later rests in
  view, and the other way round. The matcher does not guess that a still hand "does not count":
  a hand held still is also how two-hand gestures differ from each other and from one-hand
  gestures with the same path. So examples should be recorded as the child will sit when using
  the device, and both ways if both will happen.

## What `FeatureSequence` is and is not

`FeatureSequence` in `features.ts` is the payload the matcher compares (schema version 2: version
1 had no `hands` field, cut the gesture by visibility and laid it out by frame number; its
sequences are not comparable with these). Version 1 was never stored. Since card NG-19, sequences
of version 2 are stored inside the example record below, so **every change of the feature
weights, the step count or the rules of `buildFeatureSequence` that changes values must raise
`FEATURE_SCHEMA_VERSION`**; stored examples of the old version are then reported as
`incompatible` and have to be recorded again. The type is still exported under its old name
`FeatureSequenceV1` as well, because `dtw.ts` imports that name.

## Stored examples (card NG-19)

Code: `src/recognition/examples.ts`, tests `test/examples.test.mjs`. Storage layout and limits:
[storage.md](storage.md), "Gesture examples". The view that records them:
[caregiver.md](caregiver.md), "Teaching a gesture".

One example is one data entry of its profile, `gesture.<conceptId>.<12 hex characters>`, written
through the profile store (`saveExample`). Its value, `GestureExampleRecordV1`:

```json
{ "version": 1, "conceptId": "trinken", "capturedAt": "2026-11-23T09:30:00.000Z",
  "featureSchemaVersion": 2, "anchor": "shoulders", "hands": "right", "decimals": 4,
  "frames": 20, "durationMs": 1900, "steps": [[0, 0, …], …] }
```

- `steps` are the 32 x 86 values of the `FeatureSequence`, as weighted by `features.ts`, rounded to
  `EXAMPLE_DECIMALS` (4) decimals; negative zero is stored as zero; a typed array is turned into
  plain numbers first. `frames` and `durationMs` (first to last frame) describe the recording; the
  matcher does not use them. `hands` is what `buildFeatureSequence` decided for the recording
  (`left`, `right` or `both`), so one- and two-hand examples are told apart in the record.
- The profile is not in the record: the key says whose it is, and a restore under a new id
  (`onConflict: "copy"`) must not leave a record that names another profile.
- **No landmark, picture or video is stored, so features cannot be rebuilt.** Decided for card
  NG-19: keeping raw landmarks on the device would allow re-extraction after a schema change, but
  they are a finer trace of the child's body and several times larger (21 points per hand, two
  coordinates, every frame of the recording instead of 32 steps). After a schema change the
  examples have to be recorded again; the caregiver area says so for each example that cannot be
  used. Because no landmarks are kept, the caregiver area does not mention them.
- **Reading is strict** (`parseExampleRecord`): exactly these fields, `version` 1, the feature
  schema of this app, `decimals` 4, values already in stored form, a real UTC timestamp, and the
  concept id of the data name. Anything else is listed as damaged by `listExamples`, never dropped
  or repaired: `unsupported-version` (record version or feature schema above this app's: a newer
  app wrote it; never deleted by this app), `incompatible` (an older feature schema: record again)
  or `unreadable`.
- `countExamples` counts examples per concept from the data names alone, so the board editor can
  show "Gebärde: 3 Beispiele" without reading every example on every redraw.
- `sequenceFromRecording` is what the teaching view runs on a recording: the tracker adapter's
  `toLandmarkFrames`, then `buildFeatureSequence`, with the adapter's defaults (shoulders when
  seen, nothing removed). A recording that gives no sequence is refused with the builder's reason.
  For a two-hand sequence it also says whether one hand stayed within `MIN_TRAVEL` (`handTravel`:
  palm centres averaged over `SPEED_SPAN_MS`, in shoulder widths, or three hand lengths without
  shoulders; an approximation of the builder's own movement rule). That is a hint for the
  caregiver only ("Eine Hand lag still im Bild …"); nothing about it is stored, and the matcher
  does not use it.

**Precision and what rounding costs.** Four decimals is 0.00005 at most per value; distances
between repetitions of one gesture are 0.2 to 1.2. Checked with a probe that is not part of the
repository (run by hand for card NG-19): the four profiles of the second table above (right, left,
both, mixed; 12 gestures, 3 examples in each of two teaching sessions), each with the three kinds
of unknown movements of the first table, under eight of its disturbances (none, second hand 100
and 250 ms, a hand lost for 300 and 450 ms, rest 1 s, 7 and 7 to 15 frames per second); attempts
at full precision against the examples at full precision and against the same examples rounded:
**0 of 20,736 decisions changed** (top-1 10,437, wrong concept 0, unknown 1,083, unknown movements
accepted 2,833 on both sides; the closest distance moved by 0.00002 at most; no calibrated limit
changed). A small version of that comparison is in `test/examples.test.mjs`. Size as the store
counts it: a one-hand example is about 13 kB (30 kB at full precision), a two-hand one about 21 kB
(55 kB).


## Measured on synthetic gestures

`EVAL_FULL=1 npm test` prints the numbers of the tables below (`test/recognition-eval.test.mjs`;
`simulateProfile`, `simulateProfileUnder` and `simulateHandCases` in `evaluate.ts`). Plain
`npm test` runs the same rows and limits with fewer attempts, so that it stays fast: 2 attempts
and 2 unknown movements per gesture and later session in the first table (60 and 60 per row), 2
and 1 in the second (48 and 24 per profile and row); the other tables are the same in both. Its
numbers therefore differ from those below. Both runs assert that no row speaks a known gesture
as a wrong concept, or an unknown movement as a concept, more often than the matcher of schema
version 1 did on the same captures; in the rows where version 1 does so (rows "30%", "20%" and
"10%" and the scattered-frame rows below) the test holds the share measured for it. **They are
not accuracy claims**: see below the tables.

Where a table shows **before → after**, "after" is what `EVAL_FULL=1 npm test` prints. "Before"
is not printed by it: it was measured for card NG-18 by compiling the feature builder, matcher
and DTW of schema version 1 (commit `70bf62b`) together with today's `synthetic.ts` and
`evaluate.ts` and running the same test file against them, so both sides saw the same captures.

**The profile of the first card**: 15 gestures (right hand, some with the left as well), 3
examples per gesture in each of 2 teaching sessions, then 5 attempts per gesture in each of 2
later sessions with a different camera placement, with sloppy repetitions.

| Unknown movements used | Top-1 | Top-3 | Known gesture spoken as wrong concept | Unknown accepted (spoken as a concept) |
| --- | --- | --- | --- | --- |
| Unrelated movements | 100% → 100% | 100% → 100% | 0% → 0% | 0.8% → 0.8% |
| Look-alikes with two fingers held differently | 100% → 100% | 100% → 100% | 0% → 0% | 2.5% → 2.5% |
| Look-alikes that end half a shoulder width away | 100% → 100% | 100% → 100% | 0% → 0% | 100% → 100% |

150 known and 120 unknown attempts per row, 90 examples. With the steps spaced evenly in time
(the build before this one), one more look-alike with other fingers was accepted (5.0%): its
distance to the nearest concept fell just under that concept's limit. With the steps in frame
order, as in schema version 1, the same look-alikes are accepted as before.

**One hand, two hands and what a real capture adds** (card NG-18). Four profiles of 12 gestures
each: right hand only, left hand only, both hands, and mixed (four of each kind). Examples are
recorded with the hands resting 0.3 s before and after; the attempts get the disturbance of the
row. Cells are top-1 in percent, before → after.

| Attempts with | Right hand | Left hand | Both hands | Mixed profile | Wrong concept, worst profile |
| --- | --- | --- | --- | --- | --- |
| No disturbance | 98 → 98 | 100 → 100 | 100 → 100 | 98 → 98 | 0 → 0 |
| Second hand passes for 100 ms | 81 → 99 | 79 → 100 | 100 → 100 | 85 → 100 | 0 → 0 |
| … 250 ms | 17 → 54 | 18 → 54 | 100 → 100 | 46 → 76 | 0 → 0 |
| … 450 ms | 0 → 0 | 0 → 0 | 100 → 100 | 33 → 33 | 0 → 0 |
| … 700 ms | 0 → 0 | 0 → 0 | 100 → 100 | 33 → 33 | 0 → 0 |
| Other hand rests in view throughout | 0 → 0 | 0 → 0 | 100 → 100 | 33 → 33 | 0 → 0 |
| A hand lost for 150 ms | 100 → 100 | 100 → 100 | 98 → 98 | 98 → 98 | 0 → 0 |
| … 300 ms | 5 → 97 | 12 → 97 | 10 → 93 | 9 → 95 | 0 → 0 |
| … 450 ms | 0 → 53 | 2 → 53 | 2 → 48 | 0 → 49 | 0 → 0 |
| … 600 ms | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| Hands rest 0.5 s before and after | 100 → 100 | 100 → 100 | 98 → 98 | 99 → 99 | 0 → 0 |
| … 1 s | 98 → 98 | 100 → 100 | 100 → 100 | 98 → 98 | 0 → 0 |
| … 2 s | 98 → 98 | 100 → 100 | 98 → 98 | 98 → 98 | 0 → 0 |
| 15 frames per second | 100 → 100 | 99 → 99 | 98 → 98 | 98 → 98 | 0 → 0 |
| 7 frames per second | 98 → 98 | 97 → 97 | 98 → 94 | 95 → 93 | 0 → 0 |
| 7 to 15 frames per second, unsteady | 98 → 98 | 98 → 98 | 100 → 100 | 98 → 98 | 0 → 0 |

120 attempts, 96 unknown movements and 72 examples per profile and row; each profile's examples
are recorded once and used for every row. A known gesture was not spoken as a wrong concept in
any row, before or after; every failure is an "unknown" answer. No unknown movement was spoken
as a concept in any cell (the last figure of each cell in the output), before or after. (The
build before this one spoke 1.0% of them as a concept in one cell, the right-hand profile at 7
frames per second.)

- A hand lost for up to 0.3 s and hands resting for seconds before and after no longer change
  the result, and a second hand passing for 0.1 s does not either.
- **A second hand passing for a quarter of a second gives `unknown` about half of the time,
  and always from 450 ms** (`hands_unclear`): the synthetic gestures last 0.6 to 2.6 s, so a
  hand passing for 250 ms is often in view for more than a fifth of the capture, and a hand
  passing for 450 ms or more moves on its own. That is the price of never dropping a hand that
  might belong (next table). No cell is worse than before.
- Compared with the build before this one (which cut the gesture by movement and spaced the
  steps in time), top-1 moves by under 2 points in most cells. It falls for a hand lost for
  450 ms (right 58 → 53, left 59 → 53, mixed 53 → 49) and for 600 ms (right 20 → 0, left 16 →
  0, mixed 4 → 0, as before the card), and rises at 7 frames per second for the right hand
  (93 → 98). The causes were not analysed further.
- **The other hand resting in view, taught without it, is `unknown`** (`other_hands`) in every
  attempt, as before. See "Input contract".
- **A hand lost for longer than half a second** between two sightings fails by the rule
  (`hand_lost`); the 450 ms row sits at that limit, because the gap between sightings is the
  dropout plus the frames around it.
- **Low frame rates cost a little**: at 7 frames per second up to 7% of the attempts are
  answered `unknown`, more than before for the two-hand and mixed profiles.
- The rows with rest were already good before, because here the examples rest as well. They
  are the same without any trim.

**The hand that does not sign** (card NG-18). Scripted cases with three examples per sign and 40
attempts per kind of attempt (200 where marked) from a later session; right-hand signs X, Y, Z that only change or
hold a shape, and A, B, C that travel. "Lap hand": the left hand lying in view. Cells are
percent, before → after.

| Case | Top-1 | Spoken as a wrong concept | Answered "unknown" |
| --- | --- | --- | --- |
| Signs without travel, lap hand in view and still; attempts: lap hand fidgets | 100 → 100 | 0 → 0 | 0 → 0 |
| The same, and the lap hand fidgeted in one of three examples of X | 100 → 100 | 0 → 0 | 0 → 0 |
| Signs without travel; somebody's hand reaches in during one example of X and during the attempts | 0 → 0 | 0 → 0 | 100 → 100 |
| The child does not sign: its hand lies in view, the lap hand fidgets (one example of X had the fidget) | (no sign made) | 0 → 0 | 100 → 100 |
| Signs with travel, lap hand in view and still; attempts: lap hand fidgets after the sign | 100 → 100 | 0 → 0 | 0 → 0 |
| A two-hand sign with one hand held still, and a one-hand sign with the same path | 100 → 100 | 0 → 0 | 0 → 0 |
| Two two-hand signs that differ only in the shape of the hand held still | 100 → 100 | 0 → 0 | 0 → 0 |
| Signs with travel, lap hand in view; attempts: both hands tremble (4 Hz, 0.04 shoulder widths) | 100 → 100 | 0 → 0 | 0 → 0 |
| Signs with travel, lap hand in view; attempts: small and slow (40% of the size in 2 s) | 100 → 100 | 0 → 0 | 0 → 0 |
| Signs with travel, no other hand; attempts: small and slow (40% of the size in 2 s) | 100 → 100 | 0 → 0 | 0 → 0 |
| Signs with travel taught without the other hand; attempts: lap hand in view and still | 0 → 0 | 0 → 0 | 100 → 100 |
| Same path, attempts of the two-hand sign: second hand seen throughout | 100 → 100 | 0 → 0 | 0 → 0 |
| Same path, attempts of the two-hand sign: second hand seen for 75% of the movement | 0 → 0 | 0 → 0 | 100 → 100 |
| Same path, attempts of the two-hand sign: second hand seen for 60% of the movement | 0 → 0 | 90 → 0 | 10 → 100 |
| Same path, attempts of the two-hand sign: second hand seen for 50% of the movement | 0 → 0 | 100 → 0 | 0 → 100 |
| Same path, attempts of the two-hand sign: second hand seen for 40% of the movement | 0 → 0 | 100 → 0 | 0 → 100 |
| Same path, attempts of the two-hand sign: second hand seen for 30% of the movement | 0 → 0 | 100 → 100 | 0 → 0 |
| Same path, attempts of the two-hand sign: second hand seen for 20% of the movement | 0 → 0 | 100 → 100 | 0 → 0 |
| Same path, attempts of the two-hand sign: second hand seen for 10% of the movement | 0 → 0 | 100 → 100 | 0 → 0 |
| Same path, attempts of the two-hand sign: second hand seen for 75% when taught, for 40% in the attempts | 100 → 0 | 0 → 0 | 0 → 100 |
| Same path, attempts of the two-hand sign: second hand moves for 0.4 s when taught, for 0.25 s in the attempts | 100 → 100 | 0 → 0 | 0 → 0 |
| Same path, second hand crosses from −500 ms (the capture start) to +200 ms when taught, to 0 ms in the attempts | 100 → 0 | 0 → 0 | 0 → 100 |
| Same path, second hand crosses from −500 to +200 ms when taught, to +50 ms in the attempts | 100 → 0 | 0 → 0 | 0 → 100 |
| Same path, second hand crosses from −500 to +600 ms when taught, to +100 ms in the attempts | 100 → 0 | 0 → 0 | 0 → 100 |
| Same path, second hand crosses from −500 to +150 ms, shifted by up to 150 ms either way, taught and attempted alike (200 attempts) | 100 → 0 | 0 → 0 | 0 → 100 |
| Same path, second hand crosses from +300 to +1400 ms when taught, from +900 ms in the attempts | 100 → 0 | 0 → 0 | 0 → 100 |
| Same path, second hand crosses from +300 to +1400 ms when taught, from +1050 to +1450 ms in the attempts | 0 → 0 | 63 → 0 | 38 → 100 |
| Same path, second hand crosses from +1000 to +1400 ms, shifted by up to 150 ms either way, taught and attempted alike (200 attempts) | 100 → 0 | 0 → 0 | 0 → 100 |
| Same path, second hand held still: seen throughout when taught, only until the right hand starts in the attempts | 0 → 0 | 100 → 0 | 0 → 100 |
| Same path, held hand of the two-hand sign seen only in a rest of 2 s before the movement | 0 → 0 | 0 → 0 | 100 → 100 |
| Same path, … only in a rest of 2 s after it | 0 → 0 | 0 → 0 | 100 → 100 |
| Same path, … only in rests of 1.5 s before and after it | 100 → 0 | 0 → 0 | 0 → 100 |
| Same path, … only in a rest before it: 0.3 s when taught, 2 s in the attempts | 0 → 0 | 0 → 0 | 100 → 100 |
| Same path, … only in a rest of 2 s before it, at 7 frames per second | 0 → 0 | 0 → 0 | 100 → 100 |
| Same path, … the same at 12 frames per second | 0 → 0 | 0 → 0 | 100 → 100 |

- No row is spoken as a wrong concept more often than before. Three earlier builds of this
  card did: the first dropped a hand that did not move; the second measured the shares for a
  one-hand reading over that hand's own movement, so a second hand that moved and left just
  before or after it was dropped (rows "crosses … to 0 ms", "… to +50 ms", "… to +100 ms",
  "from +900 ms", "from +1050 ms": all attempts spoken as the one-hand sign); the third
  measured them over the span of both hands' movements, so a held hand seen only in the rest
  before or after the movement was dropped (the rows "held hand seen only in a rest": all
  attempts spoken as the one-hand sign, and up to 100% in the jitter rows below). Measured over
  the whole time a hand is in view, they are recognised or `unknown`.
- In the "crosses" rows the right hand moves from 0 to 1000 ms. In the examples the second
  hand is often unclear as well, so the two-hand sign has few or no examples; the attempts are
  then compared with the one-hand sign only.
- **A second hand seen for less than a fifth of the time a hand is in view, and not moving on
  its own, is taken for a hand passing through**, so the two-hand sign is answered with its
  one-hand twin (rows "30%", "20%" and "10%": the matcher of schema version 1 speaks it as well
  in these rows, but not in general; see the "held hand" rows, where it does not and neither
  does this one). Nothing in a capture tells a hand that belongs and is seen for a moment from
  one that passes by. Between a fifth and a half the answer is `unknown`. Seen for 30% of the
  movement, the second hand is in view for 300 of the 2,200 ms of the capture, under a fifth.
- The rows "seen for 75% when taught, for 40% in the attempts", "75%" and "60%" (shares of the
  movement, which are about a third of the capture) and the "crosses" rows were recognised by
  one of the earlier builds and are `unknown` now: the price of the band in which nothing is
  built and of never dropping a hand that moved. The rows "held hand seen only in a rest" are
  `unknown`, as with version 1: the held hand belongs (it is in view for more than half of the
  capture) but is missing during the movement, where the examples show it. The build before
  this one held it where it was last seen and recognised them.

**Tracker jitter** (card NG-18). The resting hand in the cases above jitters by 0.004 shoulder
widths per frame; a real tracker shows 0.01 to 0.02 (3 to 5 pixels). The six cases below are
taught and attempted with the jitter and frame rate of the column, 30 attempts per kind of
attempt. Cells are top-1 in percent, before → after. **No attempt in these 54 rows was spoken
as a wrong concept, before or after**; every miss is `unknown`.

| Case | 0.01, 10/s | 0.01, 15/s | 0.01, 30/s | 0.015, 10/s | 0.015, 15/s | 0.015, 30/s | 0.02, 10/s | 0.02, 15/s | 0.02, 30/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Signs without travel, no other hand | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 |
| Signs without travel, lap hand in view and still | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 | 100 → 100 |
| Signs without travel; somebody's hand reaches in (one example of X, the attempts) | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| Same path, held hand seen only in a rest of 2 s before | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| … only in a rest of 2 s after | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 |
| … only in rests of 1.5 s before and after | 97 → 0 | 100 → 0 | 100 → 0 | 97 → 0 | 100 → 0 | 100 → 0 | 97 → 0 | 100 → 0 | 100 → 0 |

- Signs that only change or hold a shape are not cut down by jitter: nothing is trimmed.
- Held hand seen only in the rests: it belongs, but is missing during the movement, so the
  attempt is `unknown` (in both rests, lost for longer than half a second: `hand_lost`).

**Stronger jitter and wrong frames** (card NG-18). Signs without travel (X, Y, Z), lap hand in
view and still, 30 attempts per sign. In the first six rows examples and attempts have the
jitter and frame rate of the row; in the last four the examples have jitter 0.02 at 15 frames
per second and the attempts also have frames in which the tracker shows the whole right hand
0.2 or 0.4 shoulder widths off. Cells are percent, before → after.

| Case | Top-1 | Spoken as a wrong concept | Answered "unknown" |
| --- | --- | --- | --- |
| Jitter 0.025, 7 frames per second | 100 → 100 | 0 → 0 | 0 → 0 |
| Jitter 0.025, 10 frames per second | 100 → 100 | 0 → 0 | 0 → 0 |
| Jitter 0.025, 15 frames per second | 100 → 100 | 0 → 0 | 0 → 0 |
| Jitter 0.03, 7 frames per second | 100 → 100 | 0 → 0 | 0 → 0 |
| Jitter 0.03, 10 frames per second | 100 → 100 | 0 → 0 | 0 → 0 |
| Jitter 0.03, 15 frames per second | 100 → 100 | 0 → 0 | 0 → 0 |
| Jitter 0.02, 15 frames per second; attempts: 1 frame with the hand 0.2 shoulder widths off | 100 → 100 | 0 → 0 | 0 → 0 |
| … 1 frame 0.4 off | 100 → 100 | 0 → 0 | 0 → 0 |
| … 3 frames 0.2 off | 100 → 100 | 0 → 0 | 0 → 0 |
| … 3 frames 0.4 off | 100 → 100 | 0 → 0 | 0 → 0 |

The build before this one cut the gesture by movement; in reviewer probes like these rows a
wrong frame or strong jitter at a low frame rate cut a sign without travel down to its rest, and
some of those attempts were spoken as a wrong concept. Without a trim, none is here.

**Somebody's hand reaches in** (card NG-18). A profile of five one-hand signs (A, B, C, X, Y)
and four two-hand signs that share their right-hand paths (A and B with a held hand, C with a
second hand that moves and with one held where that one ends). In the attempts of A, B and C,
somebody's hand reaches into the picture and out again, still open, 20 attempts per sign.
Cells are percent, before → after.

| Reaches in | Top-1 | Spoken as a wrong concept | Answered "unknown" |
| --- | --- | --- | --- |
| 2 times for 600 ms, 0.5 shoulder widths | 0 → 0 | 0 → 0 | 100 → 100 |
| once for 900 ms, 0.5 shoulder widths | 0 → 0 | 0 → 0 | 100 → 100 |
| once for 1200 ms, 0.5 shoulder widths | 0 → 0 | 0 → 0 | 100 → 100 |
| once for 1500 ms, 0.5 shoulder widths | 0 → 0 | 0 → 0 | 100 → 100 |
| 2 times for 600 ms, 0.1 shoulder widths | 0 → 0 | 0 → 0 | 100 → 100 |
| once for 1200 ms, 0.1 shoulder widths | 0 → 0 | 0 → 0 | 100 → 100 |
| 2 times for 600 ms, 0.5 shoulder widths, 7 to 15 frames per second, unsteady | 0 → 0 | 0 → 0 | 100 → 100 |

- Reaching in for half of the capture or more, the hand belongs, and the attempt is a two-hand
  capture. The build before this one held the hand, outside its visit, where it was first and
  last seen, which made it look like the held hand of TA or the end of M1: it spoke up to 67%
  of these attempts as a two-hand sign. Missing outside its visit, as in version 1, it is far
  from them.

**A held hand seen in scattered frames** (card NG-18). The two-hand sign with a held hand and
its one-hand twin, as in the "same path" rows; in the attempts of the two-hand sign the tracker
sees the held hand in each frame only with the chance of the row (40 attempts per row). Cells are
percent, before → after.

| Held hand seen with chance, frame rate | Top-1 | Spoken as a wrong concept | Answered "unknown" |
| --- | --- | --- | --- |
| 0.1, 15 frames per second | 0 → 0 | 68 → 18 | 33 → 83 |
| 0.1, 30 frames per second | 0 → 0 | 65 → 0 | 35 → 100 |
| 0.1, 7 to 15 frames per second, unsteady | 0 → 0 | 78 → 55 | 23 → 45 |
| 0.15, 15 frames per second | 8 → 0 | 38 → 0 | 55 → 100 |
| 0.15, 30 frames per second | 0 → 0 | 23 → 0 | 78 → 100 |
| 0.15, 7 to 15 frames per second, unsteady | 8 → 0 | 35 → 13 | 58 → 88 |
| 0.2, 15 frames per second | 23 → 0 | 15 → 0 | 63 → 100 |
| 0.2, 30 frames per second | 8 → 0 | 8 → 0 | 85 → 100 |
| 0.2, 7 to 15 frames per second, unsteady | 15 → 0 | 30 → 15 | 55 → 85 |
| 0.25, 15 frames per second | 28 → 0 | 5 → 0 | 68 → 100 |
| 0.25, 30 frames per second | 25 → 0 | 3 → 0 | 73 → 100 |
| 0.25, 7 to 15 frames per second, unsteady | 33 → 0 | 18 → 5 | 50 → 95 |
| 0.3, 15 frames per second | 43 → 0 | 0 → 0 | 58 → 100 |
| 0.3, 30 frames per second | 55 → 0 | 0 → 0 | 45 → 100 |
| 0.3, 7 to 15 frames per second, unsteady | 38 → 3 | 10 → 3 | 53 → 95 |

- The build before this one dropped the held hand when it was in view for under a fifth of the
  time, scattered or not, and spoke the one-hand twin more often than version 1 (up to 100% of
  these attempts). Dropped only after one unbroken visit, it is spoken less often than by
  version 1 in every row; the rest are `unknown`, including those that version 1 recognised
  (top-1 up to 55% before, 3% at most now).
- A sign taught in three tidy examples with shoulders and two loose ones without (one at 40%,
  one at 160% of the size), attempted with look-alikes (other hand shapes on the same path)
  without shoulders, 40 attempts per look-alike: spoken as a concept 0% → 0%. The build before
  this one calibrated the loose examples without the tidy ones and spoke half of them as the
  concept.

The gestures are generated, differ strongly from each other and are repeated more consistently
than a child would. The simulated sessions differ only in camera shift, zoom and tilt, which the
features remove by construction, so the session split is far easier than a real one. The jitter
of a resting hand (except in the jitter table), the fidget, the tremor, the way a hand is lost and the path of a passing hand
are made up, and the speed, time and share limits above were chosen on them. Captures without
shoulders and mislabelled examples are not part of the evaluation. The tables show that the
pipeline is deterministic and tolerant of the distortions modelled in `synthetic.ts`, nothing
more.

## Advice while teaching (card NG-4)

The teaching view tells the caregiver how a new recording fits the profile's examples
(`src/teach/fit.ts`, [caregiver.md](caregiver.md)). It calls `matchGesture` with
`calibrateMaxDistance` of the profile's examples and `DEFAULT_MIN_MARGIN`, exactly as the child's
board does, so it changes no number in this document and needs no new measurement. On the
synthetic gestures of `test/teach.test.mjs` it reports a repetition as fitting, another tile's
gesture as resembling that tile, and an unrelated gesture as different. A look-alike that the
matcher accepts (one that ends elsewhere) is reported as fitting too: the advice is only as
good as the matcher's limits. Stored examples can be replayed as a stick-figure hand drawn from
these features (`src/teach/replay.ts`); that shows what is compared, not a recording.

## A continuous stream cut into gestures (card NG-53)

The owner asked for continuous recognition: the camera runs while the gesture view is open, and a
child can make several gestures one after another (card NG-54 is the view). The matcher compares
one finished attempt, so the stream has to be cut into attempts first. Code:
`src/recognition/segment.ts` (`segmentStream`); measured with `simulateStream` in
`src/recognition/evaluate.ts`.

- **Two ways to cut.**
  - "away": a gesture ends when no hand is in view for longer than `SEGMENT_GAP_MS` (700 ms,
    200 ms more than `MAX_BRIDGED_GAP_MS`). A hand lost by the tracker for as long as the builder
    bridges never cuts a gesture.
  - "rest": also where the hands rest in view for `REST_SPLIT_MS` (1 s) after a movement, cut in
    the middle of that rest. A hand at rest moves slower than `REST_SPEED`, measured on the palm
    centre against the same hand at least `SPEED_SPAN_MS` earlier; a hand that just came into view
    is neither moving nor resting.
  - A cut at a rest never falls inside a loss of the hand: both parts start and end with a frame
    that has a hand (found by the first review of the card).
  - Nothing is trimmed inside a segment, as for an attempt. A segment longer than `SEGMENT_MAX_MS`
    (10 s) is dropped, not compared. A gesture still going on at the stream's end is returned as
    `open`.
- **How it was measured.** The synthetic profile of the tables above (15 gestures, examples from
  two teaching sessions, calibrated as there). In each of the two later sessions, 3 known gestures
  and 2 unknown movements per gesture, shuffled, are joined into streams of six with a pause
  between them:
  - "hands away": no hand in view for the pause;
  - "hands rest": the hands rest at the end posture, move to the next start posture in 400 ms
    (`TRANSITION_MS`) and rest there.
  
  An "away" pause keeps the hands out of view for exactly the pause (a review of card NG-54 found
  one frame added to it before; the 600, 1000 and 1500 ms rows did not change).

  Each segment goes to the matcher. A segment belongs to the movement it overlaps most. A known
  gesture counts as top1 when a segment of it is accepted as the right concept and none as a
  wrong one, as wrong concept when a segment of it is accepted as a wrong one, and as missed
  otherwise. A movement counts as split when more than one segment overlaps it at all, whichever
  movement each segment is scored against (counted that way since card NG-54). Segments that overlap no movement and are accepted count as "said in a pause".
  - **Baseline:** the very same captures, each scored on its own as one attempt ("one by one").
- **The gate.** In the stream, no more wrong concepts and no more unknown movements accepted than
  one by one on the same captures, and nothing said in a pause. No matcher threshold was changed.

Measured with `EVAL_FULL=1`-size streams (90 known gestures and 60 unknown movements per row):

| Cut | Between gestures | Sloppiness | Unknown kind | Top1 | Wrong concept | Missed | Unknown accepted | Said in a pause | Split / merged / too long | One by one: top1 / wrong / unknown accepted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| away | hands away 1000 ms | 0.5 | unrelated | 100.0 % | 0.0 % | 0.0 % | 1.7 % | 0 | 0 / 0 / 0 | 100.0 % / 0.0 % / 1.7 % |
| away | hands away 1000 ms | 0.5 | other-fingers | 100.0 % | 0.0 % | 0.0 % | 15.0 % | 0 | 0 / 0 / 0 | 100.0 % / 0.0 % / 15.0 % |
| away | hands away 1000 ms | 1.5 | unrelated | 100.0 % | 0.0 % | 0.0 % | 0.0 % | 0 | 0 / 0 / 0 | 100.0 % / 0.0 % / 0.0 % |
| away | hands away 1000 ms | 1.5 | other-fingers | 100.0 % | 0.0 % | 0.0 % | 1.7 % | 0 | 0 / 0 / 0 | 100.0 % / 0.0 % / 1.7 % |
| away | hands away 1500 ms | 0.5 | unrelated | 100.0 % | 0.0 % | 0.0 % | 1.7 % | 0 | 0 / 0 / 0 | 100.0 % / 0.0 % / 1.7 % |
| away | hands away 1500 ms | 0.5 | other-fingers | 100.0 % | 0.0 % | 0.0 % | 15.0 % | 0 | 0 / 0 / 0 | 100.0 % / 0.0 % / 15.0 % |
| away | hands away 1500 ms | 1.5 | unrelated | 100.0 % | 0.0 % | 0.0 % | 0.0 % | 0 | 0 / 0 / 0 | 100.0 % / 0.0 % / 0.0 % |
| away | hands away 1500 ms | 1.5 | other-fingers | 100.0 % | 0.0 % | 0.0 % | 1.7 % | 0 | 0 / 0 / 0 | 100.0 % / 0.0 % / 1.7 % |
| away | hands away 600 ms | 0.5 | unrelated | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 2 / 24 | 100.0 % / 0.0 % / 1.7 % |
| away | hands away 600 ms | 0.5 | other-fingers | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 2 / 24 | 100.0 % / 0.0 % / 15.0 % |
| away | hands away 600 ms | 1.5 | unrelated | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 2 / 24 | 100.0 % / 0.0 % / 0.0 % |
| away | hands away 600 ms | 1.5 | other-fingers | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 2 / 24 | 100.0 % / 0.0 % / 1.7 % |
| away | hands away 699 ms | 0.5 | unrelated | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 2 / 24 | 100.0 % / 0.0 % / 1.7 % |
| away | hands away 699 ms | 0.5 | other-fingers | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 2 / 24 | 100.0 % / 0.0 % / 15.0 % |
| away | hands away 699 ms | 1.5 | unrelated | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 2 / 24 | 100.0 % / 0.0 % / 0.0 % |
| away | hands away 699 ms | 1.5 | other-fingers | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 2 / 24 | 100.0 % / 0.0 % / 1.7 % |
| rest | hands rest 1000 + move 400 + rest 1000 ms | 0.5 | unrelated | 15.6 % | 0.0 % | 84.4 % | 0.0 % | 0 | 21 / 32 / 22 | 100.0 % / 0.0 % / 1.7 % |
| rest | hands rest 1000 + move 400 + rest 1000 ms | 0.5 | other-fingers | 15.6 % | 0.0 % | 84.4 % | 1.7 % | 0 | 27 / 41 / 23 | 100.0 % / 0.0 % / 8.3 % |
| rest | hands rest 1000 + move 400 + rest 1000 ms | 1.5 | unrelated | 11.1 % | 0.0 % | 88.9 % | 0.0 % | 0 | 21 / 36 / 22 | 98.9 % / 0.0 % / 0.0 % |
| rest | hands rest 1000 + move 400 + rest 1000 ms | 1.5 | other-fingers | 13.3 % | 0.0 % | 86.7 % | 0.0 % | 0 | 28 / 42 / 21 | 98.9 % / 0.0 % / 0.0 % |
| rest | hands rest 1500 + move 400 + rest 1500 ms | 0.5 | unrelated | 100.0 % | 0.0 % | 0.0 % | 3.3 % | 0 | 150 / 124 / 0 | 100.0 % / 0.0 % / 1.7 % |
| rest | hands rest 1500 + move 400 + rest 1500 ms | 0.5 | other-fingers | 100.0 % | 0.0 % | 0.0 % | 11.7 % | 0 | 149 / 124 / 0 | 100.0 % / 0.0 % / 1.7 % |
| rest | hands rest 1500 + move 400 + rest 1500 ms | 1.5 | unrelated | 98.9 % | 0.0 % | 1.1 % | 0.0 % | 0 | 150 / 124 / 0 | 98.9 % / 0.0 % / 0.0 % |
| rest | hands rest 1500 + move 400 + rest 1500 ms | 1.5 | other-fingers | 97.8 % | 0.0 % | 2.2 % | 3.3 % | 0 | 150 / 124 / 0 | 98.9 % / 0.0 % / 0.0 % |
| away | hands rest 1000 + move 400 + rest 1000 ms | 0.5 | unrelated | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 0 / 26 | 100.0 % / 0.0 % / 1.7 % |
| away | hands rest 1000 + move 400 + rest 1000 ms | 0.5 | other-fingers | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 0 / 26 | 100.0 % / 0.0 % / 8.3 % |
| away | hands rest 1000 + move 400 + rest 1000 ms | 1.5 | unrelated | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 0 / 26 | 98.9 % / 0.0 % / 0.0 % |
| away | hands rest 1000 + move 400 + rest 1000 ms | 1.5 | other-fingers | 0.0 % | 0.0 % | 100.0 % | 0.0 % | 0 | 0 / 0 / 26 | 98.9 % / 0.0 % / 0.0 % |

- **"away" passes the gate, by construction of the synthetic stream.**
  - With the hands out of view for 1 s or 1.5 s between gestures, every number equals the
    one-by-one numbers on the same captures. No movement is split or merged, and nothing is said
    in a pause.
  - The equality is by construction. In the synthetic stream the hands come into view and leave
    it from one frame to the next, and each capture is trimmed to its frames with a hand. So the
    cut finds exactly the frames that are scored one by one. What this shows: the cut puts its
    boundaries where the movements are, and never splits or joins them when the hands leave for
    longer than the gap. It does not show how the cut does when hands leave slowly or half out of
    the picture ("Not measured" below).
  - The 15 % of "other-fingers" look-alikes accepted at low sloppiness are the matcher's, one by
    one as well: a known limit of the matcher (see above), not of the cut.
- **A pause shorter than the gap is safe but useless.** At 600 ms, and at 699 ms just under the
  gap, the movements run together,
  the long segments are dropped or match nothing, and nothing is said. No wrong concept, nothing
  accepted.
- **"rest" is not usable.**
  - With 1 s rests it passes the gate as defined (no wrong concept, unknown movements accepted no
    more often), but the cut is too rare: the movements run together and 84 to 89 % of gestures
    are missed.
  - With 1.5 s rests it fails the gate: the move between two postures becomes a segment of its own, and unknown
    movements are accepted more often than one by one (3.3 % against 1.7 %, 11.7 % against 1.7 %).
    That segment is counted as "merged": the spans of the movements include their rests, so it
    always overlaps one and is scored against it. "Said in a pause" cannot happen in these rows.
  - It is not used.
- **Cut at "away" while the hands rest in view,** the whole stream is one movement: dropped,
  nothing said.

**What follows for the view (card NG-54).** Continuous recognition cuts at "away". The child, or
the caregiver, lowers the hands out of the picture for about a second between two gestures. The
view has to make that clear without reading, for example by showing when a gesture has been taken.
With the hands kept up between gestures, the measured streams were longer than 10 s and dropped, so
nothing was said; short streams with the hands kept up were not measured. The view (card NG-54)
therefore keeps an explicit way to end a gesture ("Fertig").

**Not measured.** All of the above is synthetic. Real tracker streams have hands that leave
slowly, half out of the picture, or a lap in view, and children who do not lower their hands. The
private evaluation tool (card NG-5) has to repeat this on real recordings before the gate counts
for a child. Real recordings never go into the repository. Static signs (shape only, no travel)
were not part of the synthetic profile.

## Known limits

- **Look-alikes that end somewhere else are accepted** (last table row). The distance sums over the
  whole path, so a difference at the end is diluted below the normal variation between
  repetitions. Until this is solved, the UI must confirm before speaking; the board does
  ([recognise.md](recognise.md)).
- **Rest is part of the gesture.** A long rest before or after makes the movement a smaller
  part of the sequence, so examples and attempts with very different rest are farther apart
  (as with the matcher of schema version 1). In the tables above rest of up to 2 s, with
  examples resting 0.3 s, costs at most 2 points of top-1; nothing guarantees that for a real
  child. A lap hand that fidgets well before or after the sign is in the gesture as well.
- **The steps are spaced in frame order.** A frame rate that changes within a capture (for
  example, a phone that drops frames for a moment) stretches or squeezes that part of the
  sequence, as with the matcher of schema version 1.
- **A hand in view for between a fifth and a half of the time a hand is in view gives no
  answer** (`hands_unclear`), and so does a still hand next to which another hand was seen
  briefly. The shares were chosen on made-up captures; a caregiver's hand in the picture will
  often land there. Long rest before or after a gesture changes the shares: a hand that rests
  in view longer counts for more.
- **A hand in view for less than a fifth of that time, without a movement of its own, is
  ignored**, also when it belonged to a two-hand gesture (rows "30%" to "10%" above). The fifth
  is a share, not a time, so a short capture tolerates less: 120 ms in one of 0.6 s.
- **A second hand that moves on its own (half of 0.1 shoulder widths over 0.3 s or more) and
  leaves, before, during or after the gesture, gives no answer** (`hands_unclear`), however
  briefly it was seen.
- **A hand that belongs is missing before its first and after its last sighting.** A held hand
  of a two-hand sign that the tracker sees only before or after the movement gives `unknown`.
- **A child who makes a gesture with the other hand, or with the other hand resting in view when
  it was taught without, gets `unknown`** (`other_hands`) and an empty correction list, until an
  example with those hands exists.
- **Two examples do not protect against a mislabelled one.** With one good and one wrong example the
  concept's limit grows with their distance, up to the upper bound; the median only helps from
  three examples.
- **All limits and weights are provisional.** The shape/position balance, the fallback limit for a
  single example (0.75) and the upper calibration bound (1.5) were chosen on synthetic data and
  have to be revisited with real recordings (card NG-5).
- **Without shoulders, a tilted camera is not corrected**, and limits are untuned for that case.
- **2D only.** Depth is ignored; gestures that differ only towards or away from the camera look
  the same.
- **A hand of the gesture lost for longer than 0.5 s** fails the attempt; nothing is said to the
  child about why. Whether half a second is right for a real tracker is open (card NG-5).
- **Follow-ups for the UI and the camera task, not solved here:** `hands_unclear` covers several
  situations that a UI cannot tell apart (a second hand in between the shares, a second hand
  that moved and left, a still hand next to a brief one, no hand in view for half of the time),
  so it cannot yet say what to do differently. A child who makes a taught one-hand gesture with
  the other, free hand gets `too_far` when its examples were taught with that hand resting in
  view (both hands), not a hint that the hand changed. A single false frame of the other hand
  (the tracker sees a hand for one frame where there is none) is a hand seen briefly next to a
  hand that does not move: in the reviewer probe `ng18-blind4/a4.mjs`, rerun on this build (not
  part of `npm test`), top-1 for signs without travel fell from 100% to 44% at 15 frames per
  second and to 57% at 7 to 15, every miss `hands_unclear`, none spoken wrong; two false frames
  1.2 s apart, separate visits, gave 4% and 21%. The camera task could drop such single frames. A lap hand that holds a toy (a fist) when it was open in the
  examples gives `too_far` with both matchers (probe `ng18-blind4/c1.mjs`): the resting hand's
  shape is part of a two-hand sequence.
- **Stored examples are not re-extracted.** A change of the features makes every stored example
  `incompatible`; they have to be recorded again (see "Stored examples").
- **Cost is unmeasured on phones.** Informal runs in Node on a desktop CPU took between 3 and 7 ms
  per attempt against 90 examples; no test tracks this.
