# Gesture recognition core

Code: `src/recognition/`. Board card: NG-1. Product slice: S3 in
[#1176](https://github.com/voku/AmysEcho/issues/1176) (matcher only; no camera, UI or storage yet).

The hand-tracker decision, with what was measured and what only the phone can answer, is in
[tracker-decision.md](tracker-decision.md) (card NG-16).

## How it works

1. **Landmark frames in.** A capture is a list of frames with up to two hands (21 points each, in
   MediaPipe order) and, when visible, the two shoulders. See "Input contract" below.
2. **Feature sequence out** (`features.ts`, schema version 1).
   - Frames before the first and after the last visible hand are dropped.
   - Position, zoom and tilt of the camera are removed using the shoulders. Without shoulders the
     sequence is anchored to the centre of the hand movement and is only compared with other
     sequences anchored the same way.
   - Tracking dropouts of up to 6 frames per hand are interpolated.
   - The gesture is resampled to 32 steps by frame index, so overall speed does not matter as long
     as the frame rate is steady. Timestamps are only checked for order.
3. **Comparison** (`dtw.ts`). Dynamic time warping gives the cost of the best alignment divided by
   the sequence length, so a gesture may be faster or slower in parts.
4. **Decision** (`matcher.ts`). The attempt is compared with the examples of one child profile.
   The answer is a concept or `unknown`, with up to three closest concepts for a correction list.
   `unknown` has three causes: no examples, best match too far away, or two concepts about equally
   close.
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
- **`left` and `right` must mean the same thing in every capture of a profile.** Which convention is
  used (the child's own hands, or sides of the image) is not decided yet, and a front camera mirrors
  the image. In reviewer probes, mirrored attempts or swapped hand labels were rejected 100% of the
  time, and labels flickering on 10% of frames between a quarter and two fifths of the time,
  depending on how the flicker was simulated. The synthetic data never varies this.
- **Examples and attempts need the same anchor.** If shoulders are visible in the examples but not
  in an attempt (or the other way round), nothing is comparable: the answer is `unknown` with the
  reason `no_examples` and an empty correction list.

## What `FeatureSequenceV1` is and is not

`FeatureSequenceV1` in `features.ts` is the payload the matcher compares. It is not yet the stored
record described in section 3 of the product contract, which also needs the profile, timestamps,
quality fields and provenance; that record is designed with storage (card NG-2).

The feature weights and the step count are baked into the values. Changing any of them makes old
sequences incomparable with new ones, so every such change must raise `FEATURE_SCHEMA_VERSION`.
Because raw landmarks are not kept, stored examples cannot be recomputed after such a change; they
have to be recorded again unless storage keeps unweighted features. That decision belongs to NG-2.

## Measured on synthetic gestures

`test/recognition-eval.test.mjs` simulates one profile with 15 gestures: 3 examples per gesture in
each of 2 teaching sessions, then 5 attempts per gesture in each of 2 later sessions with a
different camera placement, with sloppy repetitions. `npm test` prints these numbers.

| Unknown movements used | Top-1 | Top-3 | Known gesture spoken as wrong concept | Unknown rejected | Unknown accepted (spoken as a concept) |
| --- | --- | --- | --- | --- | --- |
| Unrelated movements | 100% | 100% | 0% | 99.2% | 0.8% |
| Look-alikes with two fingers held differently | 100% | 100% | 0% | 96.7% | 3.3% |
| Look-alikes that end half a shoulder width away | 100% | 100% | 0% | 0.8% | 99.2% |

150 known and 120 unknown attempts per row, 90 examples.

**These are not accuracy claims.** The gestures are generated, differ strongly from each other and
are repeated more consistently than a child would. The simulated sessions differ only in camera
shift, zoom and tilt, which the features remove by construction, so the session split is far easier
than a real one. Captures without shoulders, one-handed profiles and mislabelled examples are not
part of the evaluation. The table shows that the pipeline is deterministic and tolerant of the
distortions modelled in `synthetic.ts`, nothing more.

## Known limits

- **Look-alikes that end somewhere else are accepted** (last table row). The distance sums over the
  whole path, so a difference at the end is diluted below the normal variation between
  repetitions. Until this is solved, the UI must confirm before speaking.
- **The start and end of a gesture are "a hand is visible".** A hand resting in view before or
  after the movement becomes part of the gesture; in a probe with one second of rest on each side,
  16% of attempts were rejected. Real segmentation is not built.
- **Two examples do not protect against a mislabelled one.** With one good and one wrong example the
  concept's limit grows with their distance, up to the upper bound; the median only helps from
  three examples.
- **All limits and weights are provisional.** The shape/position balance, the fallback limit for a
  single example (0.75) and the upper calibration bound (1.5) were chosen on synthetic data and
  have to be revisited with real recordings (card NG-5).
- **Without shoulders, a tilted camera is not corrected**, and limits are untuned for that case.
- **2D only.** Depth is ignored; gestures that differ only towards or away from the camera look
  the same.
- **One hand lost for longer than 6 frames** is treated as the hand leaving. A hand missing at the
  very start or end of a capture is not filled in.
- **Cost is unmeasured on phones.** Informal runs in Node on a desktop CPU took between 3 and 7 ms
  per attempt against 90 examples; no test tracks this.
