# Gesture recognition core

Code: `src/recognition/`. Board card: NG-1. Product slice: S3 in
[#1176](https://github.com/voku/AmysEcho/issues/1176) (matcher only; no camera, UI or storage yet).

## How it works

1. **Landmark frames in.** A capture is a list of frames with up to two hands (21 points each, in
   MediaPipe order) and, when visible, the two shoulders. Any consistent 2D unit works.
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

## Measured on synthetic gestures

`test/recognition-eval.test.mjs` simulates one profile with 15 gestures: 3 examples per gesture in
each of 2 teaching sessions, then 5 attempts per gesture in each of 2 later sessions with a
different camera placement, with sloppy repetitions. `npm test` prints these numbers.

| Unknown movements used | Top-1 | Top-3 | Wrong concept spoken | Unknown rejected |
| --- | --- | --- | --- | --- |
| Unrelated movements | 100% | 100% | 0% | 99.2% |
| Look-alikes with two fingers held differently | 100% | 100% | 0% | 96.7% |
| Look-alikes that end half a shoulder width away | 100% | 100% | 0% | 0.8% |

150 known and 120 unknown attempts per row, 90 examples.

**These are not accuracy claims.** The gestures are generated, differ strongly from each other and
are repeated more consistently than a child would. The table shows that the pipeline is
deterministic and tolerant of the distortions modelled in `synthetic.ts`.

## Known limits

- **Look-alikes that end somewhere else are accepted** (last table row). The distance sums over the
  whole path, so a difference at the end is diluted below the normal variation between
  repetitions. Until this is solved, the UI must confirm before speaking.
- **All limits and weights are provisional.** The shape/position balance, the fallback limit for a
  single example (0.75) and the upper calibration bound (1.5) were chosen on synthetic data and
  have to be revisited with real recordings (card NG-5).
- **Without shoulders, a tilted camera is not corrected**, and limits are untuned for that case.
- **2D only.** Depth is ignored; gestures that differ only towards or away from the camera look
  the same.
- **One hand lost for longer than 6 frames** is treated as the hand leaving. A hand missing at the
  very start or end of a capture is not filled in.
- **Cost is unmeasured on phones.** An informal run in Node on a desktop CPU took about 3.5 ms per
  attempt against 90 examples; no test tracks this.
