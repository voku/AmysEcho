# Amy's Echo TODO

**Last refreshed:** 2026-04-06
**Current mode:** supported-core refactor

This file tracks only concrete cleanup work.

Supported-core implementation status: complete.
Remaining open items are cleanup and archive tasks, not blockers for the supported product surface.

## 1. Route and screen cleanup

- [x] Keep only the supported core routes first-class in the webapp router.
- [x] Redirect old non-core routes instead of exposing them as primary navigation.
- [x] Delete the non-core screen components once redirects and references are fully gone:
  - `webapp/src/components/Dashboard.tsx`
  - `webapp/src/components/CommunicationInsights.tsx`
  - `webapp/src/components/ProgressTracker.tsx`
  - `webapp/src/components/ProgressChart.tsx`
  - `webapp/src/components/CaregiverReport.tsx`
  - `webapp/src/components/SignVideoGallery.tsx`
  - `webapp/src/components/SignLanguageHistory.tsx`
  - `webapp/src/components/SettingsOverview.tsx`
  - `webapp/src/components/SignLanguageTutorial.tsx`
  - `webapp/src/components/AboutAmysEcho.tsx`
  - `webapp/src/components/FeatureAvailability.tsx`
- [x] Remove their tests after the components are deleted.
- [x] Remove the corresponding CSS blocks from `webapp/src/App.css` after the component deletions land.

## 2. Backend surface cleanup

- [x] Stop registering non-core server routes in the default server bootstrap.
- [x] Remove dead imports, tests, and docs that assumed the non-core routes were part of the product:
  - training video gallery flow
  - separate pretraining status flow
  - cadence/reporting endpoints presented as normal product surface
- [ ] Split `server/src/server.ts` into smaller modules once the remaining route cleanup is finished.

## 3. Training-path cleanup

- [x] Compare `server/training/` against `server/src/amyserver_tools/`.
- [x] Move any still-needed code from `server/training/` into `server/src/amyserver_tools/`.
- [x] Delete `server/training/` when it is confirmed duplicate.
- [x] Fold pretraining ideas into the normal training pipeline vocabulary; keep dataset/bootstrap logic only where it still helps training quality.
- [x] Change docs so they reference only one canonical Python training path.

## 4. Repo artifact cleanup

- [x] Stop tracking local SQLite files and runtime job-state JSON.
- [x] Remove committed dry-run and benchmark artifact trees from the active docs path:
  - `docs/operations/post-training-cadence-dry-run-2026-04-06-artifacts/`
  - `docs/testing/benchmarks/results/`
- [ ] Move one-off evidence docs into a clearer archive location or delete them if they no longer justify their weight.
- [x] Check for other tracked runtime noise with:
  - `git ls-files | rg "db.sqlite|\\.wal$|\\.shm$|coverage|dist|debug|artifacts"`
  - Result: no forbidden tracked runtime files remain; the remaining `artifacts` hits are intentional docs or placeholder files.

## 5. Scope-doc alignment

- [x] Reset `README.md` to describe the supported core instead of broad maturity claims.
- [x] Add `docs/architecture/supported-core.md`.
- [x] Shrink `spec/AmysEcho.md` further so it stops mixing historical ambition with current implementation truth.
- [x] Remove or relabel roadmap/docs that still treat metrics, protocols, benchmark gates, or ops evidence as the main project story.
