# Gap Analysis (Step-by-step, file-by-file)

Date: 2026-03-25

Purpose: compare pinned external reference files against Amy's Echo implementation and identify concrete adaptation gaps.

---

## Step 1 — Baseline and scope

External files analyzed:

1. `kinivi/hand-gesture-recognition-mediapipe`
   - `utils/cvfpscalc.py`
   - `model/keypoint_classifier/keypoint_classifier.py`
   - `app.py`
2. `kevinjosethomas/sign-language-processing`
   - `readme.md`
   - `src/client/src/app/components/Avatar.tsx`
3. `google-ai-edge/mediapipe`
   - solution docs listed in `sources.json` (`hands.md`, `pose.md`, `face_mesh.md`) as API/architecture references

Amy's Echo files matched:

- `webapp/src/gesture/core/GestureDetector.ts`
- `webapp/src/hooks/useSignLanguageDetector.ts`
- `webapp/src/gesture/core/CameraManager.ts`
- `webapp/src/training/trainingValidator.ts`
- `webapp/src/components/TrainingRecorder.tsx`

---

## Step 2 — File-by-file comparison and gaps

### 2.1 `kinivi/utils/cvfpscalc.py`

Observed pattern:
- sliding-window FPS measurement with deque smoothing.

Amy's Echo status:
- Has per-frame timing (`GestureDetector`) and adaptive camera controls (`CameraManager`), but no explicit user-facing FPS signal in detector HUD.

Gap:
- Missing explicit smoothed FPS metric that can be surfaced in telemetry/HUD and used for device benchmark reports.

Action:
1. Add `SmoothedFpsMeter` utility in webapp gesture layer.
2. Emit `fps_avg` and `fps_p95_window` telemetry.
3. Show optional caregiver debug FPS in recorder/detector diagnostics.

---

### 2.2 `kinivi/model/keypoint_classifier/keypoint_classifier.py`

Observed pattern:
- dedicated classifier wrapper with fixed model I/O contract and thread control.

Amy's Echo status:
- Detector path is integrated with MediaPipe and custom model decisions, but model interface boundaries are less explicit than a small dedicated classifier adapter.

Gap:
- Missing a strict, standalone model-adapter boundary for alternative classifier backends and deterministic A/B checks.

Action:
1. Introduce `GestureModelAdapter` interface (predict, metadata, warmup).
2. Keep model-specific details out of detector loop.
3. Add contract tests for model adapter determinism on fixture landmarks.

---

### 2.3 `kinivi/app.py`

Observed pattern:
- clear preprocessing pipeline: relative coordinates, normalization, history, and mode-based data logging.

Amy's Echo status:
- Has training capture and validator, but preprocessing assumptions for classifier input and logging traceability are distributed across modules.

Gap:
- Missing single documented "feature contract" from raw landmarks -> normalized model input -> persisted training bundle metadata.

Action:
1. Add `docs/training/landmark-feature-contract.md`.
2. Add one canonical utility for normalization used by both inference and bundle validation checks.
3. Add regression fixtures that ensure identical normalization output across paths.

---

### 2.4 `sign-language-processing/readme.md`

Observed pattern:
- explicit separation of receptive vs expressive pipelines and semantic-fallback strategy.

Amy's Echo status:
- Strong receptive pipeline and training loop already present; expressive/avatar flow is not first-class in architecture docs.

Gap:
- Missing explicit architecture section for future expressive output roadmap (even if non-goal today), including profile-scoped semantics and fallback behavior.

Action:
1. Add architecture note in docs clarifying current scope (receptive-first) and future expressive milestones.
2. Define non-goals to prevent accidental scope creep in current releases.

---

### 2.5 `sign-language-processing/src/client/src/app/components/Avatar.tsx`

Observed pattern:
- frame-index driven playback abstraction for sign animation clips.

Amy's Echo status:
- No equivalent avatar playback abstraction currently integrated in UI modules.

Gap:
- If expressive output is pursued later, there is no reusable timeline player abstraction yet.

Action:
1. Create RFC (not implementation yet): `SignAnimationTimelinePlayer` API and data format.
2. Add fixture format proposal under `docs/training` or `docs/architecture` for landmark-to-avatar timeline mapping.

---

### 2.6 MediaPipe docs (`hands.md`, `pose.md`, `face_mesh.md`)

Observed pattern:
- clear parameter semantics and confidence/tracking tradeoffs documented by modality.

Amy's Echo status:
- Runtime has adaptive camera and modality guidance, but modality parameter tuning policy is not consolidated in one place.

Gap:
- Missing one tuning matrix that maps detection/tracking thresholds and expected quality impact per modality/device class.

Action:
1. Add `docs/testing/modality-tuning-matrix.md`.
2. Tie matrix to benchmark protocol in TODO (low-end tablet / mid phone / laptop webcam).

---

## Step 3 — Prioritized implementation backlog (derived from gaps)

P0 (start now)
1. Add smoothed FPS utility + telemetry fields + optional debug display.
2. Publish landmark feature contract doc and lock with fixtures.

P1
3. Introduce model adapter contract and contract tests.
4. Add modality tuning matrix and link to benchmark runbook.

P2
5. Add expressive/animation architecture RFC and timeline player API proposal.

---

## Step 4 — Execution note

This analysis is intentionally focused on actionable, low-risk incremental work that can be integrated without regressing current camera/training stability improvements.
