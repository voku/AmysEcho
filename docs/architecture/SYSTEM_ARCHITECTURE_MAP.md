# System Architecture Map (High-Level)

This document maps the major subsystems of Amy’s Echo, highlights shared services,
and calls out duplication-sensitive areas. Use it as a guide for where to extend,
reuse, or refactor functionality without breaking the training loop.

## 1. System Context (End-to-End Flow)

```
Webapp (Browser) ──► Server API ──► Python Trainer ──► Model Artifacts ──► Webapp
   ▲                       │             │               │                 │
   └───── Local cache ◄─────┴─────────────┴───────────────┴──── Profiles/OPFS
```

Primary loop:
1) Webapp captures gesture + audio + metadata → bundles + queue  
2) Server ingests bundles → writes training manifest + datasets  
3) Trainer builds global + per-profile MLP weights  
4) Server serves latest models → webapp downloads & hot-swaps  

## 2. Major Subsystems & Responsibilities

### Webapp (`webapp/`)
- **Gesture capture & recognition**: MediaPipe runtime, MLP inference, fallback logic.  
  Key modules: `src/gesture/`, `src/gesture/core/`, `src/gesture/utils/`.  
- **Training capture & upload**: bundle creation, offline queue, upload retries.  
  Key modules: `src/training/`, `src/hooks/useTrainingRecorder.ts`, `src/hooks/useTrainingUploader.tsx`.  
- **User experience**: Recorder UI, training flows, profile selection, settings.  
  Key modules: `src/components/`, `src/hooks/`.  
- **Local storage**: IndexedDB/OPFS for bundle queue, cached MLPs, settings.  

### Server (`server/`)
- **API & orchestration**: Uploads, training triggers, model serving, GDPR endpoints.  
  Key modules: `src/server.ts`, `src/routes/`, `src/services/`.  
- **Model artifact handling**: metadata, checksum, ETag caching, profile scoping.  
  Key modules: `src/services/mlpModelArtifacts.ts`, `src/routes/latestMlpModelRoute.ts`.  
- **Profile management & integrity**: UUID registry, exports, sharing, sync.  
  Key modules: `src/services/profileRegistry.ts`, `src/routes/profileRoutes.ts`.  

### Trainer (`server/src/amyserver_tools/`)
- **MLP training & data assembly**: builds datasets, augments, trains, writes weights.  
  Key modules: `train_mlp.py`, `audio_preprocessing.py`, `dataset_utils.py`.  
- **Feature schema & multimodal fusion**: pose/face/hand/audio feature assembly and zero-padding.  

### Integration Tests (`integration/`)
- **Full training loop validation**: bundle ingest → training → model distribution.  
  Key modules: `test/`, `run-tests.mjs`.  

### Data Artifacts (`server/data/`, `data/`, `spec/`)
- **Models**: `server/data/models/<profileId>/amy_model.npz` + global baseline.  
- **Datasets**: `server/data/datasets/training_manifest.json` and uploaded bundles.  
- **Schema**: `spec/feature_schema.json` (shared across webapp + trainer).  

## 3. Shared Services & Cross-Cutting Concerns

### Training Loop Infrastructure
- **Bundle schema** must remain consistent across webapp + server ingestion.  
- **Feature schema** must align across webapp extraction + trainer input.  
- **Model metadata** (window size, input dim, audio feature size) drives webapp runtime behavior.  

### Profile & Identity
- **UUID registry** is authoritative for profile routing and personalization.  
- **GDPR export/delete** flows must clean up training artifacts, bundles, and models.  

### Reliability & Amy-First Guarantees
- **Graceful degradation**: audio optional, camera failures non-fatal, fallbacks baked into UI + inference.  
- **Low latency**: webapp pipeline optimized for <50ms inference budget.  

## 4. Duplication-Sensitive Areas (Reuse vs. Reimplement)

**Reuse (do not reimplement):**
- **Feature schema & landmark normalization** (`spec/feature_schema.json`, `webapp/src/gesture/utils/landmarkNormalizer.ts`).  
- **Bundle construction** (`webapp/src/training/trainingBundle.ts`) and ingestion assumptions (`server/src/routes/trainingBundleRoute.ts`).  
- **Model artifact format** (`amy_model.npz` metadata expectations in `webapp/src/gesture/installMlp.ts`).  

**Avoid duplication / keep in sync:**
- **Label sets & baseline gestures**: changes affect training, inference, and UI.  
- **Checksum logic**: baseline model + feature schema checks are CI gates.  
- **Training metadata**: versioning and modality stats are used for reporting and validation.  

**When to reimplement:**
- Only if a subsystem’s contract changes (e.g., new modality or schema version) and the change is
  versioned with explicit migration steps across webapp + server + trainer.

## 5. Where to Extend the System

- **New modality (e.g., new sensor)**: update feature schema → webapp extraction → trainer input → model metadata.  
- **New upload metadata**: extend bundle schema and ingestion, update training manifest, and document in `docs/training/`.  
- **New UI workflows**: keep UI logic in `webapp/src/components/` and reuse existing hooks for training and model injection.  
- **New server automation**: add to `server/src/services/` and wire via route layers (`server/src/routes/`).  

## 6. Documentation Map (Related References)

- **Codebase overview**: `docs/architecture/CodebaseOverview.md`  
- **Training loop**: `docs/training/BASELINE_MODEL_PIPELINE.md`, `docs/training/MULTIMODAL_TRAINING_GUIDE.md`  
- **Audio capture**: `docs/features/AUDIO_CAPTURE.md`  
- **Integration flow**: `docs/integration/API.md`  

