# Training Quality Log Blind Spot Analysis

## Scope
This analysis reviews the newly introduced training-quality rejection logging flow against recurring risk patterns visible in recent repository activity and automated review feedback (security, reliability, UX feedback quality, and operational scale).

It covers:
- `GET /api/v1/dgs/training-quality` API behavior
- quality-log persistence during ingestion
- webapp rendering of rejected recordings in training
- test and ops implications

## Resolution Update
- ✅ Added contract-level assertions for `/api/v1/dgs/training-quality` filtering and latest-first ordering in `server/test/trainingBundles.test.ts`.
- ✅ Added German fallback guidance for unknown quality reasons in the Training UI and regression coverage in `TrainingUploadWithRecording.test.tsx`.
- ✅ Documented profile-bound visibility semantics and latest-state behavior in `docs/integration/API.md`.
- ✅ Added a production QA checklist step to verify API↔UI rejection feedback loop in staging.

## Observed Strengths in Current Implementation
- Rejection reasons are now persisted and available to caregivers in the training UI.
- Profile-level access checks are enforced before returning quality-log entries.
- Logging failures are handled as non-critical in ingestion (no hard abort of dataset append loop).
- Log growth is bounded via a max entry cap.
- UI fetch lifecycle now uses cancellation to avoid stale updates and orphaned in-flight calls.

## Blind Spots (Self-Assessment)

### 1. API Contract Drift Risk
**Why this is a blind spot**
The historical API docs and actual route behavior for training endpoints have changed over time (status codes, payload shape, ZIP upload contract). The new endpoint can drift similarly if not pinned by integration assertions.

**Impact for Amy**
Caregiver feedback could disappear silently after backend refactors, delaying corrective retraining.

**Mitigation**
- Add/keep integration-level contract tests for `/api/v1/dgs/training-quality` response fields and sort order.
- Require doc updates in PR checklist for any route/schema changes in training APIs.

### 2. Multi-Device / Multi-Caregiver Visibility Semantics
**Why this is a blind spot**
Authorization is profile-scoped, but caregiver expectations differ: some expect household-wide visibility, others strict profile-only isolation. Current behavior is secure but not explicitly product-defined in docs.

**Impact for Amy**
Confusion in support/debug workflows: “why can caregiver X not see rejection Y?”

**Mitigation**
- Document intended visibility model in `docs/integration/API.md` and caregiver-facing product docs.
- Add one explicit server test for caregiver-shared profile access if that mode is supported.

### 3. Reason-to-Guidance Mapping Coverage
**Why this is a blind spot**
UI currently translates known machine reasons; unknown/new reasons fall back to raw strings.

**Impact for Amy**
Caregivers may receive technical wording instead of actionable, child-friendly guidance.

**Mitigation**
- Centralize reason mapping table and add a regression test that enforces localized fallback text policy.
- Track unknown reason frequency in telemetry and close gaps iteratively.

### 4. Retention and Forensics Trade-off
**Why this is a blind spot**
Entry capping prevents unbounded growth, but older forensic context is dropped.

**Impact for Amy**
Longitudinal quality trends can be lost, making it harder to diagnose persistent recording issues.

**Mitigation**
- Add optional periodic rollup (daily counts by reason/profile) before trimming.
- Document retention expectations for support teams.

### 5. Potential Race/Ordering Ambiguity Across Rapid Rejections
**Why this is a blind spot**
Rejections are deduplicated by `bundleId` and later reversed for latest-first display; under high churn this can hide intermediate states for the same bundle.

**Impact for Amy**
Support may miss transitions when debugging unstable camera sessions.

**Mitigation**
- Keep latest-only semantics (good default), but explicitly document this behavior.
- If needed later, store a compact event history per bundle (bounded length).

### 6. Production Operability Gap
**Why this is a blind spot**
There is no explicit operational checklist item to periodically validate training-quality API + UI end-to-end on staging.

**Impact for Amy**
Breakages may only be discovered after caregivers report missing feedback.

**Mitigation**
- Add a manual QA step to production checklist: upload a deliberately bad sample, verify API log entry and UI card rendering.

## Priority Action Plan
1. **P0 (Now)**: keep profile authorization + bounded logging + non-blocking ingestion (already in place).
2. **P1 (Next PR)**: add contract-style integration assertions for endpoint schema/order and unknown-reason UI handling.
3. **P1 (Next PR)**: define and document caregiver/profile visibility semantics for training-quality logs.
4. **P2**: add daily rollup metrics for long-term trend visibility without unbounded raw logs.
5. **P2**: extend staging manual QA checklist with explicit rejection-feedback loop verification.

## Amy-First Rationale
This feature is only valuable if feedback is consistently **visible**, **understandable**, and **actionable** for caregivers. The highest-risk blind spots are therefore not algorithmic, but contract drift and UX-language drift. Closing those gaps most directly improves Amy’s communication outcomes.
