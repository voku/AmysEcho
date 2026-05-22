# API (Source of Truth)

This document is the canonical API contract for Amy's Echo backend routes currently registered in:

- `server/src/server.ts`
- `server/src/routes/*.ts`

The route list below is machine-checked in CI against code route inventory.

## Authentication model

- **Required auth**: `Authorization: Bearer <accessToken>`.
- **Optional auth middleware**: endpoint allows middleware fallback, but currently still returns `401` when no user is resolved.
- **No auth**: public endpoint.

## Route index (machine-checked)

<!-- BEGIN ROUTE INDEX -->
- DELETE /api/v1/auth/account
- PUT /api/v1/account/password
- PUT /api/v1/account/profile
- POST /api/v1/auth/login
- POST /api/v1/auth/password-reset/confirm
- POST /api/v1/auth/password-reset/request
- POST /api/v1/auth/refresh
- POST /api/v1/auth/register
- POST /api/v1/auth/verify-email/confirm
- POST /api/v1/auth/verify-email/request
- GET /api/v1/config/normalization
- POST /api/v1/corrections
- POST /api/v1/crash-reports
- POST /api/v1/dgs/sample-bundles
- GET /api/v1/dgs/sample-bundles/:id
- POST /api/v1/dgs/samples
- GET /api/v1/dgs/signs
- POST /api/v1/dgs/signs
- GET /api/v1/dgs/dataset-readiness
- GET /api/v1/dgs/trained-labels
- GET /api/v1/dgs/training-quality
- GET /api/v1/dgs/training-reports
- GET /api/v1/health
- GET /api/v1/labels
- DELETE /api/v1/landmarks/templates
- GET /api/v1/landmarks/templates
- POST /api/v1/landmarks/templates
- DELETE /api/v1/landmarks/templates/:id
- POST /api/v1/metacom/sentence-improve
- GET /api/v1/models/latest
- GET /api/v1/models/metadata
- GET /api/v1/models/profiles
- GET /api/v1/models/version
- POST /api/v1/negative-samples
- GET /api/v1/profiles
- POST /api/v1/profiles
- DELETE /api/v1/profiles/:id
- GET /api/v1/profiles/:id
- PATCH /api/v1/profiles/:id
- DELETE /api/v1/profiles/:id/data
- GET /api/v1/profiles/:id/export
- POST /api/v1/profiles/:id/import
- POST /api/v1/profiles/:id/merge
- DELETE /api/v1/profiles/:id/metacom-bundle
- GET /api/v1/profiles/:id/metacom-bundle
- PUT /api/v1/profiles/:id/metacom-bundle
- POST /api/v1/profiles/:id/share
- POST /api/v1/profiles/:id/sync-token
- POST /api/v1/profiles/share/accept
- POST /api/v1/profiles/sync
- GET /api/v1/symbols
- POST /api/v1/symbols
- DELETE /api/v1/symbols/:id
- PUT /api/v1/symbols/:id
- POST /api/v1/train-model
- GET /api/v1/train-status
- GET /api/v1/train-status/:id
- GET /api/v1/train-status/cadence/latest
- GET /api/v1/profiles/:profileId/labels
- GET /api/v1/profiles/:profileId/labels/:labelId
- PATCH /api/v1/profiles/:profileId/labels/:labelId
- POST /api/v1/profiles/:profileId/labels/initialize
- GET /health
<!-- END ROUTE INDEX -->

## Endpoint contract summary

### Health and diagnostics

| Endpoint | Auth | Request schema | Response schema | Error codes/status |
|---|---|---|---|---|
| `GET /health` | No | none | `{ status, uptime, pendingTrainingJobs, checks, timestamp }` | `200` |
| `GET /api/v1/health` | No | none | same as `/health` | `200` |
| `POST /api/v1/crash-reports` | Required | body object or object[] with `message:string`, `timestamp:number`; optional `id,name,stack,extra` | `202 { status:"ok", saved:number }` | `400` invalid payload, `500` persist failure |

### Auth and account

| Endpoint | Auth | Request schema | Response schema | Error codes/status |
|---|---|---|---|---|
| `POST /api/v1/auth/register` | No | `{ username(3-50), email(email,max254), password(6-128) }` | `201 { message }` | `400` invalid body, `409` duplicate user/email, `500` registration/email failure |
| `POST /api/v1/auth/login` | No | `{ username(3-50), password(6-128) }` | `200 { user, tokens:{accessToken,refreshToken} }` | `400`, `401` bad credentials, `403` email unverified, `500` |
| `POST /api/v1/auth/refresh` | No | `{ refreshToken:string }` | `200 { user, tokens }` | `400`, `401` invalid/expired, `500` |
| `POST /api/v1/auth/password-reset/request` | No | `{ email }` | `202 { message }` | `400`, `500` |
| `POST /api/v1/auth/password-reset/confirm` | No | `{ email, resetToken, password(6-128) }` | `200 { message }` | `400` invalid/expired code, `500` |
| `POST /api/v1/auth/verify-email/request` | No | `{ email }` | `202 { message }` | `400`, `500` |
| `POST /api/v1/auth/verify-email/confirm` | No | `{ email, verificationToken }` | `200 { message }` | `400` invalid/expired code, `500` |
| `DELETE /api/v1/auth/account` | Required | `{ username, password, confirmText:"KONTO LÖSCHEN" }` | `200 { message }` | `400`, `401`, `403`, `500` |
| `PUT /api/v1/account/profile` | Required | `{ displayName?:string(1-120) }` (`userId` forbidden) | `200 { user:{id,username,email,displayName} }` | `400`, `401`, `403`, `404`, `500` |
| `PUT /api/v1/account/password` | Required | `{ currentPassword, newPassword }` (`userId` forbidden) | `200 { message }` | `400`, `401`, `403`, `404`, `500` |

### Label registry and profile label training

| Endpoint | Auth | Request schema | Response schema | Error codes/status |
|---|---|---|---|---|
| `GET /api/v1/labels` | No | none | `{ version, labels, variations, stats }` | `500` load failure |

### Profile lifecycle, sharing, GDPR

| Endpoint | Auth | Request schema | Response schema | Error codes/status |
|---|---|---|---|---|
| `GET /api/v1/profiles` | Required | none | `{ profiles:[ProfileRecord] }` | `401` unauthenticated |
| `POST /api/v1/profiles` | Required | `{ id?:uuid, displayName, metadata?:{ageYears,birthDate,primaryLanguage,notes} }` | `201 { profile }` | `400`, `401`, `403`, `500` |
| `GET /api/v1/profiles/:id` | Required | path `id` | `200 ProfileRecord` | `403`, `404` |
| `PATCH /api/v1/profiles/:id` | Required | `{ displayName?, metadata? }` | `200 ProfileRecord` | `400`, `403`, `404`, `500` |
| `POST /api/v1/profiles/:id/merge` | Required | `{ sourceProfileId, mode?:"merge"\|"transfer" }` | `200 { status:"merged", targetProfileId }` | `400`, `403`, `404`, `500` |
| `POST /api/v1/profiles/:id/share` | Required | `{ permissions:"read"\|"write" }` | `{ token, expiresAt, permissions }` | `400`, `403`, `404` |
| `POST /api/v1/profiles/share/accept` | Required | `{ token }` | `{ status:"accepted", profileId }` | `400`, `404` |
| `POST /api/v1/profiles/:id/sync-token` | Required | `{ deviceId?, deviceName? }` | `{ token, expiresAt }` | `400`, `403`, `404` |
| `POST /api/v1/profiles/sync` | Required | `{ token, deviceId?, deviceName? }` | ZIP stream + header `X-Profile-Checksum` | `400`, `404`, `500` |
| `POST /api/v1/profiles/:id/import` | Required | `{ archiveBase64 }` | `{ status:"imported", profileId }` | `400`, `403`, `404`, `500` |
| `DELETE /api/v1/profiles/:id/data` | Required | none | `{ status:"cleared", profileId }` | `403`, `404`, `500` |
| `GET /api/v1/profiles/:id/export` | Required | none | ZIP stream + header `X-Profile-Checksum` | `404`, `500` |
| `DELETE /api/v1/profiles/:id` | Required | none | `{ status:"deleted" }` | `404`, `500` |

### Symbols, custom signs, landmark templates

| Endpoint | Auth | Request schema | Response schema | Error codes/status |
|---|---|---|---|---|
| `GET /api/v1/symbols` | No | query `profileId?` (profile regex) | `{ symbols:[{id,name,category,imageUrl,profileId,emoji,color,sampleCount,samplesNeeded,isReady,status}] }` | `400`, `500` |
| `POST /api/v1/symbols` | Required | `{ id, name, category, imageUrl?, imageDataUrl?, profileId? }` (`id` regex/length validated) | `201` create or `200` update symbol object | `400`, `403`, `404` |
| `PUT /api/v1/symbols/:id` | Required | same as POST (path id enforced) | `200` symbol object | `400`, `403`, `404` |
| `DELETE /api/v1/symbols/:id` | Required | query `profileId?` for ownership scope | `204` no body | `403`, `404` |
| `GET /api/v1/dgs/signs` | Required | query `profileId` required for non-empty results, regex validated | `{ signs:[{id,label,profileId,emoji,createdAt,updatedAt,sampleCount,samplesNeeded,isReady,status}] }` | `400`, `404`, `500` |
| `POST /api/v1/dgs/signs` | Required | `{ id, label, profileId?, emoji?:string\|null }` with id/length/regex validation | `201` create or `200` update sign | `400`, `404`, `500` |
| `GET /api/v1/landmarks/templates` | Required | query `profileId` (required for non-empty) | `{ templates:[...] }` | `400`, `404`, `500` |
| `POST /api/v1/landmarks/templates` | Required | `LandmarkTemplateRequestSchema` body `{ label, profileId, landmarks, handedness? }` | `201` template object | `400`, `404`, `500` |
| `DELETE /api/v1/landmarks/templates/:id` | Required | query `profileId` required | `{ deleted:true }` | `400`, `404`, `500` |
| `DELETE /api/v1/landmarks/templates` | Required | query `profileId` + `label` required | `{ deleted:number }` | `400`, `404`, `500` |

### Training ingestion, jobs, samples, corrections

| Endpoint | Auth | Request schema | Response schema | Error codes/status |
|---|---|---|---|---|
| `POST /api/v1/dgs/samples` | Required | `{ label, profileId?, landmarks:[ [x,y,z], ... ] }` where length is `21` or `42` or `543`; `x,y in [0,1]` | `{ status:"ok" }` | `400`, `403`, `404`, `500` |
| `POST /api/v1/dgs/sample-bundles` | Required | raw ZIP (`application/zip`/octet-stream), must include `metadata.json` validated by `MetadataSchema` and valid `landmarks.json` | `202 { status:"queued", id, trainingJob?, validationSummary, qualityGate }` | `400`, `403`, `422`, `500` |
| `GET /api/v1/dgs/sample-bundles/:id` | Required | path `id`, optional header `X-Profile-Id` used for scoped bundles | `{ id,status,label,profileId,receivedAt,metadata,validationSummary,qualityGate }` | `400`, `403`, `404`, `500` |
| `GET /api/v1/dgs/dataset-readiness` | Required | none | dataset readiness summary with manifest counts, holdout status, shot readiness, blockers, and warnings; result is cached briefly per authorized manifest scope so repeated polling does not rerun the evaluator every time | `404` when evaluator is unavailable, `500` when the summary cannot be generated |
| `GET /api/v1/dgs/training-quality` | Required | query `{ profileId?, limit?:1..200 }` | `{ items:[...] }` | `400` (`code: INVALID_QUERY`), `403` (`PROFILE_UNAUTHORIZED`), `500` |
| `GET /api/v1/dgs/training-reports` | Required | query `{ profileId?, limit?:1..200 }` | `{ items:[{ runId, recordedAt, profileId, accuracy, f1Score, samples, confusionAccuracy, labels }], profileTrends:[{ profileId, latestRunId, latestRecordedAt, latestAccuracy, latestF1Score, latestSamples, accuracyDelta, f1Delta }] }` | `400` (`code: INVALID_QUERY`), `403` (`PROFILE_UNAUTHORIZED`), `500` |
| `POST /api/v1/train-model` | Required | `{ samples?:[{signId,profileId?,landmarkData:(points[]\|frames[])}], trigger?:"bundles" }` | `202 { status, jobId, pollUrl, message, queueDepth, retryAfterMs? }` | `400`, `403`, `429`, `500` |
| `GET /api/v1/train-status/cadence/latest` | Required | none | latest post-training cadence summary object | `404 { error:"Keine Cadence-Zusammenfassung vorhanden." }` |
| `GET /api/v1/train-status/:id` | Required | path `id` | training job object | `404 { id, status:"not_found" }` |
| `GET /api/v1/train-status` | Required | none | `{ error:"Training job id is required." }` | `400` |
| `POST /api/v1/corrections` | Required | `{ sign: string \| {left,right} }` | `202 { status:"queued" }` | `400`, `500` |
| `POST /api/v1/negative-samples` | Required | `{ sign: string \| {left,right} }` | `202 { status:"queued" }` | `400`, `500` |

### Models and model metadata

| Endpoint | Auth | Request schema | Response schema | Error codes/status |
|---|---|---|---|---|
| `GET /api/v1/models/latest` | Required | query `profileId?` (handler resolves profile fallback) | binary model response (`.npz`) + model contract headers | `403`, `404`, `500` |
| `GET /api/v1/models/version` | Required | none | `{ version, modelPath:"/api/v1/models/latest" }` | `500` |
| `GET /api/v1/models/metadata` | Required | query `profileId?` | `{ version, size, sha256 }` | `403`, `404` |
| `GET /api/v1/models/profiles` | Required | none | `ProfileInfo[]` where each has `{ profileId, modelAvailable, signCount, lastUpdated? }` | `500` |
| `GET /api/v1/dgs/trained-labels` | Required | query `profileId` required | `{ profileId, trainedLabels, labelDescriptors }` | `400`, `403`, `500` |
| `GET /api/v1/config/normalization` | Required | none | config JSON from `data/config/normalization_config.json` or default `{ priority_factors:{hands,pose,face} }` | `200` |

### Profile label settings

| Endpoint | Auth | Request schema | Response schema | Error codes/status |
|---|---|---|---|---|
| `GET /api/v1/profiles/:profileId/labels` | Required | path `profileId` profile-id regex | `{ labels:[...], stats:{totalLabels,enabledLabels,serverPretrainLabels,userTrainLabels,readyLabels} }` | `400`, `403`, `500` |
| `GET /api/v1/profiles/:profileId/labels/:labelId` | Required | path `profileId` regex; `labelId` regex `^[a-zA-Z0-9_-]+$` | merged readiness + setting fields | `400`, `403`, `404`, `500` |
| `PATCH /api/v1/profiles/:profileId/labels/:labelId` | Required | path validation + body `{ mode?:"server_pretrain"\|"user_train", enabled?:boolean }` with at least one field | updated readiness payload + `updatedAt` + optional `autoPretrainJob` | `400`, `403`, `404`, `500` |
| `POST /api/v1/profiles/:profileId/labels/initialize` | Required | path `profileId` regex | `{ status:"initialized", labelCount, labels }` | `400`, `403`, `500` |

## Route inventory artifact

The checked route snapshot used by CI is committed at:

- `docs/integration/api-route-inventory.json`
