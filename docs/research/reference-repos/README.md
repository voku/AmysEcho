# External Reference Repositories (Lightweight Index)

This directory intentionally stores a **small reference index** instead of vendoring third-party source files.

Why:
- keep repository size manageable,
- avoid accidental license/header drift,
- keep upstream references easy to refresh at pinned commits.

## Pinned source repositories

1. https://github.com/google-ai-edge/mediapipe @ `9d38d191b060cbfeaeb0c1aa20e47201f032ea35`
2. https://github.com/kinivi/hand-gesture-recognition-mediapipe @ `0e737bb8c45ea03f6fafb1f5dbfe9246c34a8003`
3. https://github.com/kevinjosethomas/sign-language-processing @ `c292039b77fecfad3821c71bff1de06e3fe559ec`

## Unpinned references (context only)

- https://github.com/TomasGonzalez/hand-gesture-recognition-using-mediapipe-in-react (tracked as browser React integration reference; not part of the pinned reproducible fetch set)

## Relevant upstream files to adapt

See `sources.json` for machine-readable mapping.

### MediaPipe
- `docs/solutions/hands.md`
- `docs/solutions/pose.md`
- `docs/solutions/face_mesh.md`

### kinivi hand-gesture
- `README.md`
- `app.py`
- `utils/cvfpscalc.py`
- `model/keypoint_classifier/keypoint_classifier.py`

### sign-language-processing
- `README.md`
- `src/client/README.md`
- `src/client/src/app/components/Avatar.tsx`

## Usage workflow

1. Clone upstream repository at pinned commit.
2. Review selected files.
3. Re-implement/adapt in Amy's Echo with Amy-first constraints and German UX text.
4. Keep attribution in PR description when borrowing implementation ideas.

## Fetch helper

Use the helper script to download the pinned files into a local temp folder (not committed):

```bash
node scripts/fetch-reference-sources.mjs --out-dir tmp/reference-sources
```

If your environment has unstable network access, the script now retries downloads and continues with partial results by default (non-zero exit if any file still fails). Use `--fail-fast` to stop on first failure.

```bash
node scripts/fetch-reference-sources.mjs --out-dir tmp/reference-sources --retries 3
```

Preview only:

```bash
node scripts/fetch-reference-sources.mjs --dry-run
```



## Latest gap analysis

- `GAP_ANALYSIS_2026-03-25.md` (step-by-step file-by-file mapping to Amy's Echo).

## 2026-03-25 incremental adaptation checkpoints (auto-agent mode)

1. **google-ai-edge/mediapipe**  
   - Best-practice signal: stabilize camera/task startup by respecting media element readiness before frame processing.
   - Adapted in Amy's Echo: `CameraManager` now waits briefly for `loadedmetadata`/`canplay` before `video.play()` during startup and adaptive stream swaps.
   - Self-confirmation checkpoint: ✅ completed and validated with `CameraManager` tests.

2. **kinivi/hand-gesture-recognition-mediapipe**  
   - Best-practice signal: keep runtime metrics lightweight and continuous (FPS/cycle-time visibility).
   - Adapted in Amy's Echo: retained and validated smoothed FPS + adaptive camera feedback loop already implemented in this branch.
   - Self-confirmation checkpoint: ✅ no extra patch needed after verification.

3. **kevinjosethomas/sign-language-processing**  
   - Best-practice signal: explicit end-to-end stage alignment between detection and downstream interpretation.
   - Adapted in Amy's Echo: enforced training/inference normalization parity across webapp and server by synchronizing hand normalization contract.
   - Self-confirmation checkpoint: ✅ validated by cross-language normalization sync test.

4. **TomasGonzalez/hand-gesture-recognition-using-mediapipe-in-react**  
   - Best-practice signal: browser-specific lifecycle hardening around camera/video loop initialization.
   - Adapted in Amy's Echo: startup/swap metadata readiness guard in `CameraManager` to reduce play-race failures in browser environments.
   - Self-confirmation checkpoint: ✅ completed (same implementation as checkpoint #1, applied to React/browser lifecycle concerns).
