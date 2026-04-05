# LLM Friction Reduction Audit — 2026-04-02

First command used for this task (resume hint): `rg -n "/api/v1/user/profile|/api/v1/user/password" webapp/src server/src docs`

## Why this audit exists

This document captures low-risk cleanup work that improves LLM onboarding and reduces naming confusion between account-level and profile-level APIs.

## Applied refactor in this change set

### 1) Canonical account endpoint naming

To align with the account-vs-profile boundary, account settings routes now use `/api/v1/account/*` as canonical names:

- `PUT /api/v1/account/profile`
- `PUT /api/v1/account/password`

Legacy aliases were intentionally removed to reduce contract ambiguity:

- `PUT /api/v1/user/profile` (removed)
- `PUT /api/v1/user/password` (removed)

This is a deliberate breaking change while the project is still pre-launch.

### 2) Webapp client alignment

Webapp settings forms now target canonical account endpoints. This removes ambiguity for future LLM edits and avoids introducing new code against deprecated aliases.

### 3) Contract documentation update

`docs/integration/api.md` now marks `/api/v1/account/*` as canonical and no longer lists the removed `/api/v1/user/*` account aliases.

## "Unknown/leftover" inventory for follow-up

The following areas should be reviewed in a dedicated cleanup pass because they may represent migration leftovers or naming debt:

1. **Service/module naming debt in label settings APIs**
   - Runtime routes now use `/api/v1/profiles/:profileId/labels`.
   - Internal module names still use `userLabel*` and `userId` terminology in several service files.
   - Recommended next step: rename service/module symbols to `profileLabel*` where safe.

2. **Historical migration docs with old canonical language**
   - `docs/integration/api-contract-migration-checklist-2026-03-30.md` contains a timeline where `/api/v1/user/*` appeared as an intermediate migration target.
   - Keep the 2026-04 addendum visible to prevent regressions back to old endpoint names.

3. **Generated route inventory**
   - `docs/integration/api-route-inventory.json` should be regenerated after route changes to keep docs and runtime fully aligned.

## Non-goals in this pass

- No destructive file deletions were performed in this change set.
- No behavior changes to authorization or payload schemas.
- No frontend string or UX flow changes.
