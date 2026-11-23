# Gesture recognition core

Code: `src/recognition/`. Board cards: NG-1, and NG-18 for one and two hands, time and rest. Product slice: S3 in
[#1176](https://github.com/voku/AmysEcho/issues/1176) (matcher only; no camera, UI or storage yet).

The hand-tracker decision, with what was measured and what only the phone can answer, is in
[tracker-decision.md](tracker-decision.md) (card NG-16).

## How it works

1. **Landmark frames in.** A capture is a list of frames with up to two hands (21 points each, in
   MediaPipe order) and, when visible, the two shoulders. See "Input contract" below.
2. **Feature sequence out** (`features.ts`, schema version 2). All times are milliseconds from
   the frames' timestamps, never frame counts, so the rules hold at 7 as at 30 frames per second.
   - **The gesture is cut out by movement.** A hand moves while the centre of its 21 points
     travels at `REST_SPEED` (0.25 shoulder widths per second) or faster, measured over
     `SPEED_SPAN_MS` (200 ms) so that the jitter of a resting hand stays below it. Fast frames
     form one movement while the hand is not seen to be slow for more than `MOVEMENT_GAP_MS`
     (200 ms) between them; a movement counts from `MIN_GESTURE_MS` (300 ms). The gesture runs
     from the first to the last movement, with `SEGMENT_PAD_MS` (100 ms) on each side. Hands
     resting in view before and after are left out. If nothing moves (a posture that is only
     held), the gesture is the whole time a hand is visible, as before.
   - **Which hands make the gesture** (`hands`: `left`, `right` or `both`). Presence decides,
     never movement. A hand belongs to the gesture when it is visible for at least
     `HAND_PRESENCE_SHARE` (half) of its duration, whether it moves or rests. A hand visible for
     less than `HAND_BRIEF_SHARE` (a fifth) is a hand passing through and is dropped entirely,
     not interpolated in. In between nobody can tell, and dropping the hand could turn a two-hand
     gesture into the one-hand gesture with the same path: no sequence is built
     (`hands_unclear`).
   - **Three readings, exactly one must hold.** Two hands: over the time in which either hand
     moves, both belong. Left hand alone, right hand alone: over the time in which that hand
     moves (or, if it never moves, is visible), it belongs and the other is absent or brief. If
     the hand that stays shows no movement of its own while another hand was in view, that
     reading does not hold: a hand that lies still is never matched because a hand next to it
     moved and left. No reading or more than one: `hands_unclear`.
   - A hand that rests in view for the whole gesture therefore makes it a two-hand capture, with
     the resting hand's place and shape in the sequence. It is compared with examples that show
     two hands as well; see "Input contract".
   - **A hand that belongs and is lost for a moment** is filled in between the frames around the
     gap, in proportion to the time, up to `MAX_BRIDGED_GAP_MS` (500 ms between two sightings,
     whether the frames in between show no hand or no frames arrived at all); before its first
     and after its last sighting it is held where it was seen. A longer gap is not guessed over:
     no sequence is built (`hand_lost`).
   - Position, zoom and tilt of the camera are removed using the shoulders: those seen during
     the gesture, or else those seen anywhere in the capture. Without any shoulders the sequence
     is anchored to the centre of the hand movement and is only compared with other sequences
     anchored the same way.
   - The gesture is resampled to 32 steps evenly **in time**, so neither its overall speed nor an
     unsteady frame rate changes it.
   - **When no sequence is built** the caller answers "unknown". The reasons say what was seen,
     not what to do: `no_frames`, `bad_timestamps`, `bad_landmarks`, `no_hands` (frames, but no
     hand in any), `too_short` (a hand of the gesture in fewer than three frames, or all frames
     at one timestamp), `hands_unclear` and `hand_lost` (above).
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
   own examples of that concept typically differ. More examples can widen a concept up to an
   upper bound but never make it stricter than the fixed limit a single example gets.

There is no training step and no shared model. Adding an example changes the result immediately.

## Input contract

The code does not check these; the camera task (card NG-3) has to guarantee them.

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
  comparable, it has to pass on the last shoulders it saw.
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
sequences are not comparable with these). Nothing is stored yet, so raising the version cost
nothing. Version 2 has never been stored or released either, so the hand rules were corrected
within card NG-18 without raising it again. The type is still exported under its old name `FeatureSequenceV1` as well, because
`dtw.ts` imports that name. It is not yet the stored
record described in section 3 of the product contract, which also needs the profile, timestamps,
quality fields and provenance; that record is designed with storage (card NG-2).

The feature weights and the step count are baked into the values. Changing any of them makes old
sequences incomparable with new ones, so every such change must raise `FEATURE_SCHEMA_VERSION`.
Because raw landmarks are not kept, stored examples cannot be recomputed after such a change; they
have to be recorded again unless storage keeps unweighted features. That decision belongs to NG-2.

## Measured on synthetic gestures

`npm test` prints the current numbers (`test/recognition-eval.test.mjs`; `simulateProfile` and
`simulateHandCases` in `evaluate.ts`). **They are not accuracy claims**: see below the tables.

Where a table shows **before → after**, "after" is what `npm test` prints. "Before" is not
printed by it: it was measured once for card NG-18 by compiling the feature builder and matcher
of schema version 1 (commit `73430eb`) together with today's `synthetic.ts` and `evaluate.ts`,
so both sides saw the same captures.

**The profile of the first card**: 15 gestures (right hand, some with the left as well), 3
examples per gesture in each of 2 teaching sessions, then 5 attempts per gesture in each of 2
later sessions with a different camera placement, with sloppy repetitions.

| Unknown movements used | Top-1 | Top-3 | Known gesture spoken as wrong concept | Unknown accepted (spoken as a concept) |
| --- | --- | --- | --- | --- |
| Unrelated movements | 100% → 99.3% | 100% → 100% | 0% → 0% | 0.8% → 0.8% |
| Look-alikes with two fingers held differently | 100% → 99.3% | 100% → 100% | 0% → 0% | 2.5% → 5.8% |
| Look-alikes that end half a shoulder width away | 100% → 99.3% | 100% → 100% | 0% → 0% | 100% → 98.3% |

150 known and 120 unknown attempts per row, 90 examples. More look-alikes with other fingers are
accepted than before: the cut by movement leaves less of the held start and end posture, where
the fingers show, in the sequence.

**One hand, two hands and what a real capture adds** (card NG-18). Four profiles of 12 gestures
each: right hand only, left hand only, both hands, and mixed (four of each kind). Examples are
recorded with the hands resting 0.3 s before and after; the attempts get the disturbance of the
row. Cells are top-1 in percent, before → after.

| Attempts with | Right hand | Left hand | Both hands | Mixed profile | Wrong concept, worst profile |
| --- | --- | --- | --- | --- | --- |
| No disturbance | 98 → 100 | 100 → 100 | 100 → 100 | 98 → 100 | 0 → 0 |
| Second hand passes for 100 ms | 81 → 100 | 79 → 99 | 100 → 100 | 85 → 99 | 0 → 0 |
| … 250 ms | 17 → 49 | 18 → 50 | 100 → 100 | 46 → 75 | 0 → 0 |
| … 450 ms | 0 → 8 | 0 → 3 | 100 → 100 | 33 → 42 | 0 → 0 |
| … 700 ms | 0 → 1 | 0 → 0 | 100 → 100 | 33 → 33 | 0 → 0 |
| Other hand rests in view throughout | 0 → 0 | 0 → 0 | 100 → 100 | 33 → 33 | 0 → 0 |
| A hand lost for 150 ms | 100 → 100 | 100 → 100 | 98 → 98 | 98 → 98 | 0 → 0 |
| … 300 ms | 5 → 97 | 12 → 97 | 10 → 96 | 9 → 97 | 0 → 0 |
| … 450 ms | 0 → 58 | 2 → 58 | 2 → 48 | 0 → 53 | 0 → 0 |
| … 600 ms | 0 → 26 | 0 → 23 | 0 → 1 | 0 → 12 | 0 → 0 |
| Hands rest 0.5 s before and after | 100 → 100 | 100 → 100 | 98 → 99 | 99 → 99 | 0 → 0 |
| … 1 s | 98 → 100 | 100 → 100 | 100 → 99 | 98 → 100 | 0 → 0 |
| … 2 s | 98 → 100 | 100 → 99 | 98 → 99 | 98 → 100 | 0 → 0 |
| 15 frames per second | 100 → 99 | 99 → 98 | 98 → 99 | 98 → 96 | 0 → 0 |
| 7 frames per second | 98 → 93 | 97 → 96 | 98 → 95 | 95 → 92 | 0 → 0 |
| 7 to 15 frames per second, unsteady | 98 → 97 | 98 → 97 | 100 → 99 | 98 → 96 | 0 → 0 |

120 attempts and 72 examples per profile and row. A known gesture was not spoken as a wrong
concept in any row, before or after; every failure is an "unknown" answer. Of the unknown
movements, 1% were spoken as a concept in one cell (right hand, 7 frames per second), none
before.

- A hand lost for up to 0.3 s and hands resting for seconds before and after no longer change
  the result, and a second hand passing for 0.1 s does not either.
- **A second hand passing for a quarter of a second or more mostly gives `unknown`**
  (`hands_unclear`): the synthetic gestures last 0.6 to 2.6 s, so it is often in view for more
  than a fifth of the gesture. That is the price of never dropping a hand that might belong
  (next table). No cell is worse than before.
- **The other hand resting in view, taught without it, is `unknown`** (`other_hands`) in every
  attempt, as before. See "Input contract".
- **A hand lost for longer than half a second** between two sightings fails by the rule
  (`hand_lost`); the 450 ms row sits at that limit, because the gap between sightings is the
  dropout plus the frames around it.
- **Low frame rates cost a little**: at 7 frames per second up to 8% of the attempts are
  answered `unknown`, more than before.
- The rows with rest were already good before, because here the examples rest as well.

**The hand that does not sign** (card NG-18). Scripted cases with three examples per sign and 40
attempts per kind of attempt from a later session; right-hand signs X, Y, Z that only change or
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
| Signs with travel, no other hand; attempts: small and slow (40% of the size in 2 s) | 100 → 99 | 0 → 0 | 0 → 1 |
| Signs with travel taught without the other hand; attempts: lap hand in view and still | 0 → 0 | 0 → 0 | 100 → 100 |
| Same path, attempts of the two-hand sign: second hand seen throughout | 100 → 100 | 0 → 0 | 0 → 0 |
| Same path, attempts of the two-hand sign: second hand seen for 75% of the movement | 0 → 100 | 0 → 0 | 100 → 0 |
| Same path, attempts of the two-hand sign: second hand seen for 60% of the movement | 0 → 83 | 90 → 0 | 10 → 18 |
| Same path, attempts of the two-hand sign: second hand seen for 50% of the movement | 0 → 0 | 100 → 0 | 0 → 100 |
| Same path, attempts of the two-hand sign: second hand seen for 40% of the movement | 0 → 0 | 100 → 0 | 0 → 100 |
| Same path, attempts of the two-hand sign: second hand seen for 30% of the movement | 0 → 0 | 100 → 0 | 0 → 100 |
| Same path, attempts of the two-hand sign: second hand seen for 20% of the movement | 0 → 0 | 100 → 100 | 0 → 0 |
| Same path, attempts of the two-hand sign: second hand seen for 10% of the movement | 0 → 0 | 100 → 100 | 0 → 0 |
| Same path, attempts of the two-hand sign: second hand seen for 75% when taught, for 40% in the attempts | 100 → 0 | 0 → 0 | 0 → 100 |
| Same path, attempts of the two-hand sign: second hand moves for 0.4 s when taught, for 0.25 s in the attempts | 100 → 100 | 0 → 0 | 0 → 0 |

- No row is spoken as a wrong concept more often than before. The first build of this card
  dropped a hand that did not move; with that rule `npm test` now fails, among others in the
  second and fourth row and in rows with a shared path.
- **A second hand seen for less than a fifth of the movement is taken for a hand passing
  through**, so the two-hand sign is answered with its one-hand twin (rows "20%" and "10%"), as
  before. Nothing in a capture tells a hand that belongs and is seen for a moment from one that
  passes by. Between a fifth and a half the answer is now `unknown`.
- The row "seen for 75% when taught, for 40% in the attempts" was recognised before and is
  `unknown` now: the price of the band in which nothing is built.

The gestures are generated, differ strongly from each other and are repeated more consistently
than a child would. The simulated sessions differ only in camera shift, zoom and tilt, which the
features remove by construction, so the session split is far easier than a real one. The jitter
of a resting hand, the fidget, the tremor, the way a hand is lost and the path of a passing hand
are made up, and the speed, time and share limits above were chosen on them. Captures without
shoulders and mislabelled examples are not part of the evaluation. The tables show that the
pipeline is deterministic and tolerant of the distortions modelled in `synthetic.ts`, nothing
more.

## Known limits

- **Look-alikes that end somewhere else are accepted** (last table row). The distance sums over the
  whole path, so a difference at the end is diluted below the normal variation between
  repetitions. Until this is solved, the UI must confirm before speaking.
- **The cut by movement knows speed only.** A gesture that begins or ends slower than the rest
  speed loses that part; a hand that only changes its shape does not count as moving (such a
  gesture is taken whole, with any rest around it); a resting hand that fidgets for longer than
  0.3 s starts a gesture. The limits were chosen on made-up jitter.
- **With two hands in view, either hand's movement cuts the gesture.** A lap hand that fidgets
  well before or after the sign stretches the gesture over both; in the scripted case above the
  signs were still recognised, but nothing guarantees it. When the lap hand fidgets and the
  signing hand only holds a shape, the gesture is the time of the fidget.
- **A hand in view for between a fifth and a half of the gesture gives no answer**
  (`hands_unclear`), and so does a still hand next to which another hand was seen briefly. The
  shares were chosen on made-up captures; a caregiver's hand in the picture will often land
  there.
- **A hand in view for less than a fifth of the gesture is ignored**, also when it belonged to a
  two-hand gesture (table above).
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
- **Cost is unmeasured on phones.** Informal runs in Node on a desktop CPU took between 3 and 7 ms
  per attempt against 90 examples; no test tracks this.
