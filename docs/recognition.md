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
   - **Which hands make the gesture** (`hands`: `left`, `right` or `both`). A hand belongs to it
     when it is visible for at least `HAND_PRESENCE_SHARE` (half) of the gesture's duration and,
     when anything moves, moves itself for at least `HAND_MOVING_SHARE` (a fifth) of it. A hand
     below that is dropped entirely, not interpolated in: a second hand that passes through, or
     one that rests in view, does not make a one-hand gesture two-handed. The gesture is then cut
     once more from the movement of the hands that belong to it, so a hand that passed by before
     the gesture does not start it.
   - **A hand that belongs and is lost for a moment** is filled in between the frames around the
     gap, in proportion to the time, up to `MAX_BRIDGED_GAP_MS` (500 ms between two sightings);
     before its first and after its last sighting it is held where it was seen. A longer gap is
     not guessed over: no sequence is built (`hand_lost`), which the caller treats like "unknown".
   - Position, zoom and tilt of the camera are removed using the shoulders. Without shoulders the
     sequence is anchored to the centre of the hand movement and is only compared with other
     sequences anchored the same way.
   - The gesture is resampled to 32 steps evenly **in time**, so neither its overall speed nor an
     unsteady frame rate changes it.
3. **Comparison** (`dtw.ts`). Dynamic time warping gives the cost of the best alignment divided by
   the sequence length, so a gesture may be faster or slower in parts.
4. **Decision** (`matcher.ts`). The attempt is compared with the examples of one child profile.
   An attempt is only compared with examples of the same anchor **and the same hands**: a
   right-hand attempt is never measured against a left-hand or a two-hand example. The answer is
   a concept or `unknown`, with up to three closest concepts for a correction list. `unknown` has
   five reasons: `no_examples` (the profile is empty), `other_anchor` (examples exist, none with
   the attempt's anchor), `other_hands` (none made with the same hands), `too_far`, and
   `ambiguous` (two concepts about equally close). For the first three the correction list is
   empty.
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
  reason `other_anchor` and an empty correction list. The rule itself is unchanged.
- **Frames carry timestamps in milliseconds that do not decrease.** The cut, the hand rules and
  the resampling all use them. 7 to 15 frames per second are enough for the rules; what low and
  unsteady rates cost is in the table below.
- **A gesture made with the left hand and the same gesture made with the right are different
  gestures.** `left` is the child's own left hand (above), so a child who uses either hand needs
  examples of both. Whether that is right for real children is a question for the first
  recordings (card NG-5).

## What `FeatureSequence` is and is not

`FeatureSequence` in `features.ts` is the payload the matcher compares (schema version 2: version
1 had no `hands` field, cut the gesture by visibility and laid it out by frame number; its
sequences are not comparable with these). Nothing is stored yet, so raising the version cost
nothing. The type is still exported under its old name `FeatureSequenceV1` as well, because
`dtw.ts` imports that name. It is not yet the stored
record described in section 3 of the product contract, which also needs the profile, timestamps,
quality fields and provenance; that record is designed with storage (card NG-2).

The feature weights and the step count are baked into the values. Changing any of them makes old
sequences incomparable with new ones, so every such change must raise `FEATURE_SCHEMA_VERSION`.
Because raw landmarks are not kept, stored examples cannot be recomputed after such a change; they
have to be recorded again unless storage keeps unweighted features. That decision belongs to NG-2.

## Measured on synthetic gestures

`npm test` prints these numbers (`test/recognition-eval.test.mjs`, `simulateProfile` in
`evaluate.ts`). **They are not accuracy claims**: see below the tables.

**The profile of the first card**: 15 gestures (right hand, some with the left as well), 3
examples per gesture in each of 2 teaching sessions, then 5 attempts per gesture in each of 2
later sessions with a different camera placement, with sloppy repetitions.

| Unknown movements used | Top-1 | Top-3 | Known gesture spoken as wrong concept | Unknown rejected | Unknown accepted (spoken as a concept) |
| --- | --- | --- | --- | --- | --- |
| Unrelated movements | 99.3% | 100% | 0% | 99.2% | 0.8% |
| Look-alikes with two fingers held differently | 99.3% | 100% | 0% | 94.2% | 5.8% |
| Look-alikes that end half a shoulder width away | 99.3% | 100% | 0% | 1.7% | 98.3% |

150 known and 120 unknown attempts per row, 90 examples. With schema version 1 the rows were
100% / 100% / 0% with 0.8%, 3.3% and 99.2% of the unknown movements accepted.

**One hand, two hands and what a real capture adds** (card NG-18). Four profiles of 12 gestures
each: right hand only, left hand only, both hands, and mixed (four of each kind). Examples are
recorded with the hands resting 0.3 s before and after; the attempts get the disturbance of the
row. Cells are top-1 in percent, **before → after**: "before" is the feature builder and matcher
of schema version 1 on the same captures.

| Attempts with | Right hand | Left hand | Both hands | Mixed profile | Top-3, worst profile | Wrong concept, worst |
| --- | --- | --- | --- | --- | --- | --- |
| No disturbance | 98 → 100 | 100 → 100 | 100 → 99 | 98 → 99 | 99 | 0 → 0 |
| Second hand passes for 100 ms | 81 → 100 | 79 → 99 | 100 → 99 | 85 → 98 | 99 | 0 → 0 |
| … 250 ms | 17 → 99 | 18 → 100 | 100 → 99 | 46 → 99 | 99 | 0 → 0 |
| … 450 ms | 0 → 80 | 0 → 78 | 100 → 99 | 33 → 92 | 79 | 0 → 0 |
| … 700 ms | 0 → 36 | 0 → 44 | 100 → 99 | 33 → 68 | 36 | 0 → 0 |
| Other hand rests in view throughout | 0 → 96 | 0 → 96 | 100 → 99 | 33 → 97 | 96 | 0 → 0 |
| A hand lost for 150 ms | 100 → 100 | 100 → 100 | 98 → 98 | 98 → 98 | 99 | 0 → 0 |
| … 300 ms | 5 → 97 | 12 → 97 | 10 → 94 | 9 → 95 | 94 | 0 → 0 |
| … 450 ms | 0 → 58 | 2 → 58 | 2 → 46 | 0 → 52 | 47 | 0 → 0 |
| … 600 ms | 0 → 26 | 0 → 22 | 0 → 4 | 0 → 12 | 4 | 0 → 0 |
| Hands rest 0.5 s before and after | 100 → 100 | 100 → 100 | 98 → 99 | 99 → 99 | 100 | 0 → 0 |
| … 1 s | 98 → 100 | 100 → 100 | 100 → 99 | 98 → 100 | 100 | 0 → 0 |
| … 2 s | 98 → 100 | 100 → 99 | 98 → 99 | 98 → 100 | 100 | 0 → 0 |
| 15 frames per second | 100 → 99 | 99 → 98 | 98 → 98 | 98 → 96 | 99 | 0 → 0 |
| 7 frames per second | 98 → 93 | 97 → 96 | 98 → 88 | 95 → 88 | 89 | 0 → 0 |
| 7 to 15 frames per second, unsteady | 98 → 97 | 98 → 97 | 100 → 96 | 98 → 94 | 97 | 0 → 0 |

120 attempts and 72 examples per profile and row. A known gesture was not spoken as a wrong
concept in any row, before or after; every failure is an "unknown" answer.

What the table shows, and what stays weak:

- A second hand passing through for up to a quarter of a second, the other hand resting in view,
  a hand lost for up to 0.3 s and hands resting for seconds before and after no longer change the
  result. Before, a second hand for 0.25 s or a hand lost for 0.3 s broke most attempts.
- **A second hand that is in the picture for about half of the gesture or more** makes it a
  two-hand gesture by the rule, and the answer is `unknown` (`other_hands`): the 450 ms and 700 ms
  rows. The synthetic gestures last 0.6 to 2.6 s.
- **A hand lost for longer than half a second** between two sightings fails by the rule
  (`hand_lost`); the 450 ms row sits at that limit, because the gap between sightings is the
  dropout plus the frames around it.
- **Low frame rates cost a little**: at 7 frames per second the two-hand and mixed profiles lose
  about a tenth of their attempts to `unknown`, a little more than before. The cut and the hand
  rules have few frames to go by there, and one lost frame is 0.14 s.
- The rows with rest were already good before, because here the examples rest as well. With
  schema version 1 a rest made the gesture longer; now it is cut off.

The gestures are generated, differ strongly from each other and are repeated more consistently
than a child would. The simulated sessions differ only in camera shift, zoom and tilt, which the
features remove by construction, so the session split is far easier than a real one. The jitter
of a resting hand, the way a hand is lost and the path of a passing hand are made up, and the
speed and time limits above were chosen on them. Captures without shoulders and mislabelled
examples are not part of the evaluation. The tables show that the pipeline is deterministic and
tolerant of the distortions modelled in `synthetic.ts`, nothing more.

## Known limits

- **Look-alikes that end somewhere else are accepted** (last table row). The distance sums over the
  whole path, so a difference at the end is diluted below the normal variation between
  repetitions. Until this is solved, the UI must confirm before speaking.
- **The cut by movement knows speed only.** A gesture that begins or ends slower than the rest
  speed loses that part; a hand that only changes its shape does not count as moving (such a
  gesture is taken whole, with any rest around it); a resting hand that fidgets for longer than
  0.3 s starts a gesture. The limits were chosen on made-up jitter.
- **A hand that is held still on purpose as part of a two-hand gesture is dropped** like a
  resting hand, in examples and attempts alike: the gesture is then matched by its moving hand
  alone, among the one-hand gestures of that hand.
- **A child who makes a gesture with the other hand gets `unknown`** (`other_hands`) and an empty
  correction list, until an example with that hand exists.
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
