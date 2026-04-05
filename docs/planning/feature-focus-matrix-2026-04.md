# Feature Focus Matrix — April 2026

**Date:** 2026-03-30  
**Sources:** `docs/integration/api.md`, `webapp/src/components/MainAppContent.tsx`, `docs/planning/todo.md`

## Decision labels

- **Core-now**: Active execution target right now.
- **Freeze**: Keep stable; only reliability/security/bug fixes, no scope expansion.
- **Defer**: Do not expand now; revisit after current delivery gates.

## Gating rule (explicit)

> **No new endpoint or new UI surface outside _Core-now_ may be added until all P0 items are marked done in `docs/planning/todo.md` with committed evidence artifacts.**
>
> Required P0 completion set: **APR-P0-1**, **APR-P0-2**, **MAY-P0-1**.

---

## A) API route families from `docs/integration/api.md`

| Route family | Decision | Rationale tied to active deliverables |
|---|---|---|
| Health and diagnostics | **Core-now** | Needed to support performance-truth and reproducibility evidence loops for **APR-P0-1** and **APR-P0-2** (benchmarking and measurement cycles depend on reliable diagnostics baselines). |
| Auth and account | **Freeze** | Important but not a current execution driver for **APR-P0-1**, **APR-P0-2**, **MAY-P0-1**, **MAY-P1-1**, or **JUL-P1-1**; keep stable while delivery focus stays on measurement/training pipeline. |
| Label registry and pretraining status | **Freeze** | Useful context, but current hard gates prioritize worker/device performance evidence and few-shot automation (**APR-P0-1**, **APR-P0-2**, **MAY-P0-1**) before label-scope expansions. |
| Profile lifecycle, sharing, GDPR | **Freeze** | Foundation already implemented; avoid non-critical expansion while P0 execution targets remain open (**APR-P0-1**, **APR-P0-2**, **MAY-P0-1**). |
| Symbols, custom signs, landmark templates | **Freeze** | Keep operationally stable; no new API surface unless directly required for metadata persistence contract in **MAY-P1-1**. |
| Training ingestion, jobs, samples, corrections | **Core-now** | Direct path for few-shot runner and ingestion evidence: central to **MAY-P0-1** and capture metadata persistence for **MAY-P1-1**. |
| Models and model metadata | **Core-now** | Required for validating runtime/model behavior during **APR-P0-1** and for repeatable training result verification in **MAY-P0-1**. |
| Training videos and reference videos | **Core-now** | Directly supports recording/performance measurement and long-session baselines (**APR-P0-2**, **JUL-P1-1**). |
| User label settings | **Defer** | Not on the critical path for the currently named deliverables; postpone feature expansion until **APR-P0-1**, **APR-P0-2**, and **MAY-P0-1** are complete with evidence. |

---

## B) UI surfaces from `webapp/src/components/MainAppContent.tsx`

| UI surface (route/component) | Decision | Rationale tied to active deliverables |
|---|---|---|
| `/` → `SignLanguageRecorder` | **Core-now** | Primary runtime/performance path for worker-offload and device measurement cycles (**APR-P0-1**, **APR-P0-2**). |
| `/verlauf` → `SignLanguageHistory` | **Freeze** | Maintain stability; not a primary execution target for current P0/P1 benchmark and automation goals. |
| `/lernen` → `LearningHub` | **Freeze** | Valuable UX, but not currently tied to required evidence artifacts for **APR-P0-1/2** or **MAY-P0-1**. |
| `/symbole` → `MetacomBoard` | **Freeze** | Keep stable while current roadmap emphasis is performance/reproducibility over new communication-surface expansion. |
| `/tafel` → redirect to `/symbole` | **Freeze** | Routing alias only; no expansion needed during P0 gate period. |
| `/training` → `TrainingUploadWithRecording` | **Core-now** | Key ingest/recording surface for few-shot pipeline execution and metadata persistence checks (**MAY-P0-1**, **MAY-P1-1**). |
| `/videos` → `SignVideoGallery` | **Core-now** | Supports evidence review and longitudinal capture analysis for **APR-P0-2** and **JUL-P1-1**. |
| `/dashboard` → `Dashboard` | **Core-now** | Operational summary surface needed for tracking performance/reliability outcomes from active deliverables (**APR-P0-2**, **JUL-P1-1**). |
| `/erkenntnisse` → `CommunicationInsights` | **Freeze** | Keep reliable; defer new scope until P0 measurement/automation gates are closed with evidence. |
| `/fortschritt` → `ProgressTracker` | **Core-now** | Progress visibility aligns with evidence-oriented execution cadence for **APR-P0-2** and **MAY-P0-1**. |
| `/fortschritt-detail` → `ProgressChart` | **Core-now** | Detailed trend inspection helps document benchmark deltas for **APR-P0-1**, **APR-P0-2**, and **JUL-P1-1**. |
| `/einstellungen` → `Settings` | **Freeze** | Stability-first while roadmap is focused on model/training performance proof points. |
| `/uebersicht` → `SettingsOverview` | **Freeze** | Non-critical for current P0 closure; keep stable only. |
| `/hilfe` → `Help` | **Freeze** | Keep content stable; no expansion required for current delivery evidence targets. |
| `/tutorial` → `SignLanguageTutorial` | **Freeze** | Deprioritized during benchmark and ingestion automation window. |
| `/ueber` → `AboutAmysEcho` | **Defer** | Informational surface; postpone enhancements until P0 evidence gates are complete. |
| `/betreuung` → `CaregiverArea` | **Freeze** | Maintain only; not currently mapped to open P0/P1 engineering deliverables. |
| `/elterntor` → `ParentalGate` | **Freeze** | Critical safety UX but not in active expansion scope; keep stable. |
| `/admin` → `Admin` | **Defer** | No direct linkage to current required benchmark/few-shot deliverables; postpone scope growth. |
| `/bericht` → `CaregiverReport` | **Core-now** | Reporting supports artifact discipline expected by **APR-P0-2** and **JUL-P1-1** evidence publication. |
| `/beibringen` → `Teach` | **Core-now** | Closely related to capture/training flow improvements in **MAY-P0-1** and **MAY-P1-1**. |
| `/auswahl` → `ProfileSelect` | **Freeze** | Needed for continuity, but avoid expansion until P0 completion gate is met. |
| `/profile` → `ProfileManager` | **Freeze** | Keep robust but out of expansion scope during current P0/P1 execution window. |
| `/funktionen` → `FeatureAvailability` | **Core-now** | Useful governance surface to communicate what is actively enabled during phased execution (**APR-P0-1**, **APR-P0-2**, **MAY-P0-1**). |
| `FloatingSupportButton` (global) | **Freeze** | Keep support access stable; no new feature expansion until P0 evidence complete. |
| `BottomNav` (global) | **Freeze** | Navigation stability over expansion while Core-now focuses on training/performance deliverables. |
| `*` → redirect to `/` | **Freeze** | Keep deterministic fallback behavior; no expansion needed. |

---

## Scope-control note

Until the P0 evidence gate is cleared, any request for a new endpoint or surface in a **Freeze** or **Defer** row must include:

1. A direct, written dependency on **APR-P0-1**, **APR-P0-2**, or **MAY-P0-1**, and
2. A linked evidence artifact plan in `docs/testing/benchmarks/results/` (or equivalent committed path).
