# Supported Core

## Purpose

Amy's Echo is currently maintained as a focused communication product, not as a broad experimentation platform.

The supported core is:

- caregiver authentication and profile management
- live camera recognition
- low-confidence correction flow
- training capture and upload
- profile-aware model delivery
- symbol board fallback
- basic help, settings, export, and admin maintenance needed to keep those flows usable

## Explicitly non-core for now

The following areas are no longer first-class product scope and should not drive roadmap or architecture decisions:

- analytics, progress dashboards, and reports
- tutorial/about/feature showcase surfaces
- reference-video gallery flows
- pretraining status UX as a separate product concept
- post-training cadence and benchmark artifact work as the default execution track
- auxiliary operator evidence and dry-run output committed next to product docs

These areas may stay in the repository temporarily as legacy or developer-only code, but they are not the supported path.

## Server boundary

The default server should expose only product-critical routes:

- auth
- profiles
- symbols
- training upload and status
- model delivery
- retained privacy and account flows

Legacy routes such as training-video galleries or pretraining status are not part of the supported core and should stay unregistered until they are either promoted or removed.

The underlying ideas are not automatically rejected. If curated datasets, bootstrap samples, or server-side warm-start logic improve the main training pipeline, keep them inside the normal training system instead of exposing them as a second product track.

## Repo hygiene rules

- Do not commit local SQLite databases, WAL/SHM files, runtime job-state JSON, coverage output, caches, or debug logs.
- Prefer one canonical implementation path per subsystem before adding new layers.
- If a document mainly records a one-off experiment or evidence run, archive it instead of treating it as current product guidance.
