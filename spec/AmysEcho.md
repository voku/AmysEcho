🟪 Amy’s Echo – Supported Core Specification

## Purpose

Amy’s Echo exists to help Amy be understood when she communicates with her hands.
The project is intentionally scoped to the smallest product surface that can do
that reliably.

Canonical scope boundary: `docs/architecture/supported-core.md`

## Supported product

The supported product is:

- caregiver auth
- profile creation and profile selection
- live recognition
- low-confidence correction
- training capture and upload
- profile-aware model delivery after training
- symbol-board fallback
- minimal caregiver/admin/help access needed to operate those flows

## Not in current scope

These areas are not part of the supported product unless explicitly reintroduced:

- analytics, dashboards, progress views, reporting surfaces
- tutorial, about, showcase, and feature-availability pages
- standalone training-video and reference-video UX
- separate pretraining or bootstrap product flows
- evidence, benchmark, cadence, or operator workflows as user-facing product goals

Useful ideas from those areas may survive internally, but they should not create
separate routes, APIs, or product vocabulary.

## Product principles

1. Understanding over breadth. If a feature does not directly improve recognition,
training, correction, or communication fallback, it is outside the core.
2. Soft failure over confident failure. Low-confidence recognition must fall back
to correction or symbols instead of pretending certainty.
3. One training story. Curated bootstrap data can exist, but only as part of the
normal training pipeline.
4. German-first UX. User-facing copy remains German and should stay calm, direct,
and caregiver-friendly.
5. Profile isolation matters. Training data, model artifacts, and settings must
stay attributable to the correct child profile.

## Core user flows

### 1. Sign in and choose a profile

- Caregiver signs in.
- Caregiver selects an existing profile or creates one.
- The chosen profile becomes the context for recognition, training, and model
  delivery.

### 2. Recognition loop

- Open recognition on `/`.
- Start camera capture and landmark extraction.
- Classify against the latest available profile/global model.
- If confidence is high enough, show and speak the result.
- If confidence is too low, offer correction instead of forcing a guess.

### 3. Correction loop

- Present likely alternatives for low-confidence recognition.
- Caregiver picks the intended sign.
- The correction is stored as training-relevant feedback.

### 4. Training loop

- Record a sign sample from the training flow.
- Package metadata, landmarks, still image, and clip into a bundle.
- Upload the bundle.
- Ingest it into the dataset and run the trainer.
- Publish updated model artifacts and metadata for the target profile.

### 5. Symbol fallback

- Open the symbol board when recognition is not enough.
- Let Amy or the caregiver compose meaning through symbol navigation and sentence
  support.

## Architecture boundary

### Webapp domains

- `auth`
- `profiles`
- `recognition`
- `training`
- `symbols`
- `shared`

### Server domains

- `auth`
- `profiles`
- `training`
- `models`
- `symbols`
- `shared`

### Canonical Python trainer

All maintained Python training code lives under:

- `server/src/amyserver_tools/`

The legacy duplicate training tree has been removed.

## Acceptance criteria

The supported core is healthy when all of the following are true:

1. A caregiver can sign in, select a profile, and reach recognition without
visiting removed surfaces.
2. Recognition can classify, reject uncertain guesses, and hand off to the
correction flow.
3. Training bundles can be captured, uploaded, ingested, and turned into updated
model artifacts.
4. Model delivery remains profile-aware.
5. The symbol board works as a fallback communication surface.
6. Routes, tests, docs, and styling no longer advertise removed dashboard,
progress, report, tutorial, about, or training-video surfaces as current.

## Repo hygiene rules

- Do not add new feature flags or optional route toggles just to preserve dead
  product branches.
- Do not track runtime SQLite files, WAL/SHM files, or job-state artifacts.
- Keep historical benchmark/evidence material clearly separate from the supported
  product story.
- Prefer deletion over “temporary” duplicate implementations.
