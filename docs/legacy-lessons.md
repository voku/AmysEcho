# What the first version taught us

The first Amy's Echo is preserved on the `main_old` branch. It did not work in real situations.
These are the findings from reading it and from a throwaway recognition spike on its public demo
videos (2026-11-22). They are the reasons for the rules in the README.

## Findings

1. **Clips were cut into overlapping windows.** Training used sliding windows with stride 1, so one
   recording became dozens of nearly identical samples. Whether train and validation windows came
   from the same clip was not verified, but nothing prevented it.
2. **Still poses dominated.** Still frames were weighted 10x, which hides the movement that
   separates many signs.
3. **No sign boundaries and no "unknown".** Nothing decided when a sign starts and ends, and nothing
   rejected input that is not a known sign.
4. **Never measured on real data.** Every open roadmap item was blocked on missing real-device and
   non-fixture data.
5. **Duplicate demo files.** Of 301 demo video files, 178 were distinct. The same clip was stored
   under a `_main_` and a `_var_` name.
6. **One label, several signs.** Clips for the same word showed visibly different signs across
   signers, and labels grouped different words (for example Wasser, Saft, Tee and Kaffee under
   `trinken`).

## Spike result

Hands and upper-body landmarks were extracted with MediaPipe; each clip was trimmed to the active
part, resampled to 32 steps and compared with dynamic time warping (DTW).

| Test | Result |
| --- | --- |
| Match a clip to another signer's clip of the same word (49 words) | 12% top-1, 22% top-3 |
| Match a distorted copy of a clip against 176 distinct clips, mild distortion | 99% top-1 |
| Same, medium distortion | 95% top-1 |
| Same, heavy distortion | 84% top-1 |

The first row mostly measures finding 6, not the method. The other rows are synthetic and
optimistic. Together they support per-child examples and say nothing yet about real children.

## Consequences

- Recognition is per child profile, against that child's own recorded examples.
- Evaluation is split by recording session, never by window or frame.
- "Unknown" is a first-class result.
- The demo videos are reference material on `main_old`, not ground truth and not fixtures here.
