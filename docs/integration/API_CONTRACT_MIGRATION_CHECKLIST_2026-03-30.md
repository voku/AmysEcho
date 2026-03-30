# API Contract Migration Checklist (2026-03-30)

## Endpoint renames/removals (atomic migration)

- [x] `POST /train-model` **removed** → `POST /api/v1/train-model`
- [x] `GET /api/models/profiles` **removed** → `GET /api/v1/models/profiles`
- [x] `PUT /api/user/profile` **removed** → `PUT /api/v1/user/profile`
- [x] `PUT /api/user/password` **removed** → `PUT /api/v1/user/password`

## Required call-site migrations

- [x] Webapp `resolveApiUrl` callsites updated for training and account flows.
- [x] Hook/service/model flows use only versioned contracts.
- [x] Integration tests updated to cover only new endpoints.
- [x] Temporary integration smoke test added for: auth, profile export, training upload, model fetch, status polling.
- [x] Smoke test blocks merge by asserting zero calls to removed endpoints.

## Merge gate

- [x] `integration/test/contract-smoke.test.ts` passes end-to-end.
- [x] No removed endpoint is exercised by the smoke flow.
