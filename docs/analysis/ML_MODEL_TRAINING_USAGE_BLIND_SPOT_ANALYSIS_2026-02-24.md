# ML Model Training + Runtime Usage Blind-Spot Analysis (2026-02-24)

## Scope
This analysis focuses on the current **Amy model lifecycle**:
1. per-profile/global model training,
2. model delivery (`/api/v1/models/latest`),
3. webapp model injection,
4. runtime recognition and UI visibility.

The goal is to identify where the system can still look "broken" even when parts are technically working.

---

## What was verified directly in our codebase

### 1) Per-profile training is implemented (not theoretical)
- Training pipeline explicitly trains a global model and then per-profile models (`profiles = {s.profile_id ...}` + `save_model(profile_dir / "amy_model.npz", ...)`).
- Per-profile training is skipped when sample count is below `MIN_SAMPLES_PER_PROFILE`.

**Implication:** a profile can appear "trained" in UI terms but still not get a profile model artifact if sample thresholds are not met.

### 2) Client and server both do profile -> global fallback by design
- Webapp fetch path requests profile model first, then global model.
- Server model route checks profile model path first; if not present, it serves global.

**Implication:** fallback is correct behavior, but must be visible to caregivers to avoid confusion.

### 3) Recorder output is intentionally filtered by trained labels
- Recorder only displays/records recognized signs that exist in `trainedSignLabels`.

**Implication:** generic MediaPipe detections (e.g. `thumbs_up`, `victory`) can be detected technically but hidden from the communication output if not in profile-trained labels.

### 4) Trained-label list and model-label set come from different sources
- `/api/v1/dgs/trained-labels` builds labels from aggregate counts + manifest entries.

**Implication:** if training artifacts lag behind manifest/counter state (or vice versa), UI "trained labels" and actual deployed model can drift temporarily.

---

## Additional external docs reviewed (web)

1. MediaPipe Gesture Recognizer docs (Google AI / Developers):
   - Includes canned gestures (`None`, `Thumb_Up`, `Victory`, etc.).
   - Supports custom gestures classifier options.
   - Exposes confidence thresholds (`min_hand_detection_confidence`, `min_hand_presence_confidence`, `min_tracking_confidence`).

2. TensorFlow tutorial on imbalanced data:
   - Reinforces class-weighting/imbalance risks for model behavior and confidence skew.

3. TensorFlow Lite metadata docs:
   - Confirms model metadata/label presentation is a critical contract for client display/debugging.

---

## Blind-spot matrix (current implementation)

| Priority | Blind spot | Why this can still break Amy’s experience | Suggested mitigation |
|---|---|---|---|
| P0 | **Profile model not produced due to min-sample gate** | Caregiver sees "trained signs" but runtime still uses global model; trust drops quickly. | Add explicit endpoint/UI flag: "Profilmodell vorhanden: Ja/Nein" tied to model artifact existence, not label count. |
| P0 | **Label drift between `trained-labels` API and model artifact labels** | Sign appears trained in UI but model does not predict it yet (or predicts old label variant). | Return model label-set hash/version in `/trained-labels` response and compare in client diagnostics. |
| P1 | **Fallback correctness is visible but still not fully actionable** | User knows fallback happened but not the concrete fix path (e.g., "needs N more samples"). | Add profile-training readiness details (sample count vs threshold per label/profile). |
| P1 | **Threshold mismatch between training expectations and runtime confidence gating** | Gesture may be predicted by MLP but suppressed by decision logic/thresholding/method arbitration. | Log/telemetry last top-3 candidates + threshold decision reason for a user-triggered debug window. |
| P1 | **Normalization mismatch risk (`trinken` vs `TRINKEN` / locale / suffixes)** | Minor text mismatches can hide valid detections in label-filtering stage. | Unify normalization contract across trainer, model metadata, trained-label API, and recorder filtering with one shared normalization utility spec. |
| P2 | **No explicit "model freshness" SLA in UI** | Correct model may be queued but user thinks "nothing works" during lag. | Show last training completion timestamp + currently loaded model version timestamp in recorder diagnostics. |

---

## Self-check blind spots (agent-level)

Potential blind spots in my own implementation/review process:

1. **I can over-index on code path correctness** and underweight real-device variance (lighting, camera quality, child motor variability).
2. **I can miss operational lag** (queueing/training delays) when local tests run on ideal fixtures.
3. **I can validate "model fetched" but not "model behavior improved"** without profile-specific offline eval sets.
4. **I can mistake label visibility for recognition quality** because UI filtering intentionally hides untrained labels.

Mitigation I should keep applying:
- verify both artifact flow **and** behavior flow,
- include explicit user-facing status + next action,
- test non-happy-path states (missing profile model, stale profile, auth refresh, threshold suppression).

---

## High-confidence next steps (Amy-first)

1. **Add API field: `profileModelAvailable` + `profileModelVersion`** (artifact-truth) and surface it in recorder.
2. **Expose training readiness counters** (`samplesSeen`, `minSamplesRequired`) in caregiver diagnostics.
3. **Add a "Warum nicht erkannt?" debug panel** with decision reason (label not trained, low confidence, fallback active, no profile model).
4. **Add nightly consistency check**: trained-label API output vs model artifact labels per profile.

These steps minimize silent failure and give caregivers concrete guidance in the exact moment communication breaks.
