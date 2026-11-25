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

## Features of the first version, reviewed for NG (2026-11-25)

The owner asked which parts of `main_old` are worth building again. None is ported; each is judged
against the findings above and the product contract ([s0a-product-contract-v0.1.md](s0a-product-contract-v0.1.md)).

| In `main_old` | What it did | For NG |
| --- | --- | --- |
| `DgsVideoPlayer` | A child-friendly player for DGS videos, with large controls and speeds 🐢 / 🐇 / 🐆. No page mounted it; only its own test used it. | The idea yes, the videos no. The videos are from SignDict, with the licence unchecked per video. They show different signs for one word (finding 6), and their own README warns that they may not match the child's signs. The slow replay is worth keeping. |
| Learning hub (`/lernen`) | A list of gestures with categories and search, and "start training". | Already covered by teaching in the caregiver area (card NG-4). |
| Smart practice, adaptive learning | Success rates, difficulty levels, weak gestures, generated exercises. | No. It needs measured data that does not exist (finding 4), and it puts a child under pressure to perform; the contract says "no pressure to perform". |
| `Celebration` | A random praise overlay after a recognised gesture. | No. In AAC being understood is the reward; praise for signing "right" turns communication into a test. |
| Server training, accounts, admin, history | An MLP trained on a server, login, a gesture history. | No: no backend, and no child data off the device. |
| Mirrored training data | Left/right mirrored copies of recordings as extra samples. | No. The matcher compares only what the child itself recorded. |

What NG takes from this is card NG-56, "Vormachen". A first idea, the child's own taught example
replayed as a moving stick hand, was dropped by the owner on 2026-11-25: strokes are too abstract
for children like Amy, who learn gestures from familiar people. Instead a caregiver records a short
clip of themselves doing the gesture, kept only on the device. The child watches it, optionally
mirrored and slow, and imitates it while the gesture view keeps listening. There is no child video,
no third-party video, no score and no praise. Storing these clips needs an amendment of the product
contract first.
