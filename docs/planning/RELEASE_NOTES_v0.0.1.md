# Release Notes — v0.0.1

**Tag:** `v0.0.1`  
**Date:** 2026-03-02  
**Status:** Go — all pre-tag gates passed

---

## What this release is

Amy's Echo v0.0.1 is the first tagged release of the multimodal communication platform for non-verbal children.  
It ships a complete, end-to-end DGS (Deutsche Gebärdensprache) capture-and-recognition loop together with the Metacom symbol board integration that powers Amy's daily communication.

---

## How it helps Amy

- **Zero-interruption communication** — offline-capable symbol boards with TTS keep Amy talking even without connectivity.
- **Personalised sign language** — caregivers record DGS signs; a per-profile MLP model is trained and served automatically.
- **Multimodal recognition** — hand landmarks, pose, face mesh, and optional audio (MFCC) are fused into a single model so Amy's unique communication style is captured in full.
- **German-first UX** — every message, label, and guidance string shown to Amy or her caregivers is in German.

---

## What changed (scope)

### 1 · Capture & Training Loop (Webapp → Server)
- MediaPipe Holistic landmark streaming with rolling-window capture.
- Training bundles (`landmarks.json` + `metadata.json` + `still.jpg` + optional audio) uploaded as ZIP to `/api/v1/dgs/sample-bundles`.
- Server ingests, validates, and registers bundles in `training_manifest.json`; rejects missing landmarks with HTTP 400.
- Per-profile and global MLP retraining via `/train-model` with structured JSON training report.
- Personalized model served from `/latest-mlp-model?profileId=…` with global fallback.

### 2 · Multimodal Fusion
- Pose + face + hand + audio features concatenated into one input vector (48 883 dims with audio; 48 870 without).
- Zero-padding ensures consistent dimensions for audio-absent samples.
- Non-manual DGS markers (eyebrow raise, head pitch/yaw, mouth openness) included.

### 3 · Metacom Symbol Board
- Import pipeline for caregiver-supplied Metacom symbol bundles (no symbols are bundled; license-safe).
- Stable grid UI with categories, colors, and German labels.
- Sentence composer (symbol queue + backspace/clear/TTS).
- `symbolId` persisted through training bundles and recognition output for full-cycle traceability.
- Per-profile server-side storage and cross-device sync via `GET/PUT/DELETE /api/v1/metacom/boards`.

### 4 · Profile Identity & GDPR
- UUID-based profiles with metadata (age, creation date).
- Profile deletion with cascade cleanup; profile export with all training data.
- Multi-device sync and caregiver sharing.

### 5 · Security & Operations
- JWT auth with token rotation, refresh, rate-limiting, and HTTPS enforcement.
- Audit logger for all auth events.
- Health endpoint (`/health`) with structured `ok` / `degraded` response.
- Baseline DGS model shipped at `server/data/models/global/amy_model.npz` with SHA-256 checksum.

---

## Test evidence

| Suite              | Files / Suites | Tests  | Result  |
|--------------------|---------------|--------|---------|
| Webapp (Vitest)    | 128 files      | 1 238  | ✅ Pass |
| Server TS (Jest)   | 42 suites      | 272    | ✅ Pass |
| Server Py (pytest) | —              | 113    | ✅ Pass |
| Integration        | 1 suite        | 14     | ✅ Pass |

Full evidence: `docs/testing/TEST_COVERAGE_ANALYSIS.md`

---

## Known limitations and mitigations

| Limitation | Mitigation | Owner |
|---|---|---|
| Python tests require `numpy`, `scikit-learn`, `mediapipe`, `librosa` — not auto-installed in bare CI | Document in `docs/testing/TEST_COVERAGE_ANALYSIS.md`; add `pip install -r server/requirements.txt` to CI setup step | CI / DevOps |
| No numeric coverage threshold enforced in CI | Evidence-based coverage documented; `--coverage` thresholds (≥ 80 % overall, ≥ 90 % critical) planned post-v0.0.1 | Core team |
| No long-session device performance baselines (FPS, thermal, battery) | Planned in post-v0.0.1 roadmap | Core team |
| No concurrency stress tests for training-bundle ingestion | Planned in post-v0.0.1 roadmap | Core team |
| Metacom Satzbau / Modifier configuration UI not yet implemented | Tracked in `docs/planning/TODO.md`; existing grid + sentence composer covers basic use | Core team |
| Real-device testing (mobile thermal, camera on-device) not yet validated at scale | Planned post-v0.0.1 field validation | Core team |

---

## Deployment / migration notes

1. Copy `.env.example` to `.env` and set `JWT_SECRET` (min 32 chars) before starting the server.
2. Run `pip install -r server/requirements.txt` in your Python environment before running training.
3. The global baseline model at `server/data/models/global/amy_model.npz` is shipped in-repo.  
   Verify integrity: `sha256sum -c server/data/models/global/amy_model.npz.sha256`.
4. No database migrations required for v0.0.1 — all state is file-based.

---

## Rollback notes

- Tag `v0.0.1` is the first public tag; rollback means reverting to a pre-tag commit.
- File-based state (uploads, manifests, models) can be restored from backup; no schema migration needed.

---

## Immediate post-v0.0.1 priorities

1. Real-device performance baselines (mobile FPS / thermal / battery over extended sessions).
2. Concurrency stress tests for training-bundle ingestion and retry storms.
3. Operational runbook hardening (incident playbooks + rollback drills).
4. Accessibility manual verification cadence (screen-reader and keyboard-only sessions).
5. CI coverage thresholds (≥ 80 % overall, ≥ 90 % critical modules).
