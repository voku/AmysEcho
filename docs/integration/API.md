# API Documentation

Amy's Echo now ships with a minimal backend focused on the gesture training loop. The server accepts new samples, schedules training jobs, and serves the resulting personalized models. All remaining endpoints documented below are required by the mobile client and integration tests; analytics, caregiver portal, and dialog routes have been retired.

## Base URL

- Development: `http://localhost:5000`
- Production: Configure via `VITE_API_URL` environment variable

## Response Format

All API responses follow a consistent structure:

**Success Response:**
```json
{
  "status": "ok",
  "data": { /* endpoint-specific data */ }
}
```

**Error Response:**
```json
{
  "error": "Error message in German",
  "code": "ERROR_CODE",
  "details": { /* additional error context (development only) */ }
}
```

## HTTP Status Codes

- `200 OK` - Successful GET/PUT request
- `201 Created` - Successful POST that creates a resource
- `202 Accepted` - Request accepted for processing
- `400 Bad Request` - Invalid request parameters or body
- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - Valid token but insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource already exists
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_TOKEN` | JWT token is invalid or expired |
| `INVALID_CREDENTIALS` | Username or password incorrect |
| `EMAIL_NOT_VERIFIED` | Email address not yet confirmed |
| `PROFILE_NOT_FOUND` | Requested profile doesn't exist |
| `PROFILE_UNAUTHORIZED` | User doesn't have access to this profile |
| `PROFILE_EXISTS` | Profile with this ID already exists |
| `INVALID_SAMPLE` | Sample data doesn't match expected schema |
| `TRAINING_FAILED` | Model training encountered an error |
| `MODEL_NOT_FOUND` | Requested model file doesn't exist |

## Authentication

Every request must include an `Authorization` header carrying a JWT **access token** issued by `/api/v1/auth/login` or `/api/v1/auth/register`:

```text
Authorization: Bearer <access_token>
```

Refresh expired access tokens by calling `/api/v1/auth/refresh` with the `refreshToken` from the login response. Static API tokens are no longer accepted.

### Registration

Create a caregiver account with username, email, and password:

#### POST /api/v1/auth/register

**Request Body**
```json
{
  "username": "amy",
  "email": "amy@example.com",
  "password": "super-secure-password"
}
```

**Request Validation:**
- `username`: 3-50 characters, alphanumeric plus underscore/hyphen
- `email`: Valid email format
- `password`: 6-128 characters

**Success Response (201 Created)**
```json
{
  "message": "Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse."
}
```

**Error Responses:**

*409 Conflict - User already exists*
```json
{
  "error": "Benutzername oder E-Mail-Adresse bereits vergeben.",
  "code": "USER_EXISTS"
}
```

*400 Bad Request - Invalid input*
```json
{
  "error": "Ungültige E-Mail-Adresse.",
  "code": "INVALID_EMAIL"
}
```

### Login

#### POST /api/v1/auth/login

**Request Body**
```json
{
  "username": "amy",
  "password": "super-secure-password"
}
```

**Success Response (200 OK)**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "username": "amy",
    "email": "amy@example.com",
    "role": "caregiver",
    "emailVerified": true
  }
}
```

**Error Responses:**

*401 Unauthorized - Invalid credentials*
```json
{
  "error": "Ungültige Anmeldedaten.",
  "code": "INVALID_CREDENTIALS"
}
```

*403 Forbidden - Email not verified*
```json
{
  "error": "Bitte bestätige zuerst deine E-Mail-Adresse.",
  "code": "EMAIL_NOT_VERIFIED"
}
```

### Refresh Token

#### POST /api/v1/auth/refresh

**Request Body**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200 OK)**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Password Reset

Request a password reset code and confirm it with a new password:

#### POST /api/v1/auth/password-reset/request

**Request Body**
```json
{ "email": "amy@example.com" }
```

**Success Response (202 Accepted)**
```json
{
  "message": "Wenn ein Konto existiert, wurde eine E-Mail mit einem Reset-Code gesendet."
}
```

The server always returns HTTP status `202 Accepted` and never exposes the reset code directly. Clients should prompt the caregiver to check their email.

#### POST /api/v1/auth/password-reset/confirm

**Request Body**
```json
{
  "email": "amy@example.com",
  "resetToken": "<reset-code>",
  "password": "new-secure-password"
}
```

**Success Response (200 OK)**
```json
{ "message": "Passwort wurde aktualisiert." }
```

**Error Response:**

*400 Bad Request - Invalid or expired token*
```json
{
  "error": "Ungültiger oder abgelaufener Reset-Code.",
  "code": "INVALID_RESET_TOKEN"
}
```

### E-Mail-Bestätigung

#### POST /api/v1/auth/verify-email/request

**Request Body**
```json
{ "email": "amy@example.com" }
```

**Success Response (202 Accepted)**
```json
{
  "message": "Wenn ein Konto existiert, wurde eine E-Mail mit einem Bestätigungscode gesendet."
}
```

#### POST /api/v1/auth/verify-email/confirm

**Request Body**
```json
{
  "email": "amy@example.com",
  "verificationToken": "<verification-code>"
}
```

**Success Response (200 OK)**
```json
{ "message": "E-Mail-Adresse wurde bestätigt. Du kannst dich jetzt anmelden." }
```

### Benutzerkonto

Alle Endpunkte erfordern einen gültigen Zugriffstoken. Nur bestätigte Konten dürfen Änderungen vornehmen.

#### PUT /api/user/profile

**Request Body**
```json
{
  "displayName": "Amy"
}
```

**Success Response (200 OK)**
```json
{
  "user": {
    "id": "user-1",
    "username": "amy",
    "email": "amy@example.com",
    "displayName": "Amy"
  }
}
```

#### PUT /api/user/password

**Request Body**
```json
{
  "currentPassword": "old-password",
  "newPassword": "new-password"
}
```

**Success Response (200 OK)**
```json
{ "message": "Passwort wurde aktualisiert." }
```

**Error Response:**

*401 Unauthorized - Wrong current password*
```json
{
  "error": "Aktuelles Passwort ist falsch.",
  "code": "INVALID_CURRENT_PASSWORD"
}
```

## Rate Limiting

Two rate limiters protect the service:

- `apiLimiter` covers `/api/**` and `/train-*` endpoints (default 120 requests/minute).
- `modelMetadataLimiter` throttles repeated metadata requests such as `/latest-mlp-model` and `/model-metadata` (default 10 requests/minute).

When rate limit is exceeded, the server returns:

**429 Too Many Requests**
```json
{
  "error": "Zu viele Anfragen. Bitte versuche es später erneut.",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

Headers include:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Timestamp when limit resets
- `Retry-After`: Seconds until retry is allowed

## Health Check

### GET /health

Check server health and system status. No authentication required.

**Success Response (200 OK)**
```json
{
  "status": "ok",
  "uptime": 12345.67,
  "pendingTrainingJobs": 0,
  "checks": {
    "database": {
      "status": "ok",
      "message": "Database file accessible"
    },
    "globalModel": {
      "status": "ok",
      "message": "Global model available",
      "details": {
        "path": "/path/to/model"
      }
    },
    "pythonDependencies": {
      "status": "ok",
      "message": "Required Python packages installed (numpy, sklearn, mediapipe)"
    },
    "trainingManifest": {
      "status": "ok",
      "message": "Training manifest accessible"
    }
  },
  "timestamp": "2026-02-04T03:18:40.268Z"
}
```

**Check Status Values:**
- `ok`: Component is healthy
- `warning`: Component is functional but not optimal
- `error`: Component has failed
- `degraded`: Overall system status when any check fails

## Profile Management

### POST /api/v1/profiles

Create a new profile for a child.

**Request Body**
```json
{
  "id": "12345678-1234-1234-8234-123456789abc",
  "displayName": "Amy's Profile"
}
```

**Success Response (201 Created)**
```json
{
  "profile": {
    "id": "12345678-1234-1234-8234-123456789abc",
    "displayName": "Amy's Profile",
    "userId": "user-123",
    "createdAt": "2026-02-04T03:18:40.268Z"
  }
}
```

**Error Responses:**

*403 Forbidden - Profile belongs to another user*
```json
{
  "error": "Dieses Profil gehört einem anderen Benutzer.",
  "code": "PROFILE_UNAUTHORIZED"
}
```

*409 Conflict - Profile already exists*
```json
{
  "error": "Profil existiert bereits.",
  "code": "PROFILE_EXISTS"
}
```

### GET /api/v1/profiles

List all profiles the authenticated user has access to.

**Success Response (200 OK)**
```json
{
  "profiles": [
    {
      "id": "12345678-1234-1234-8234-123456789abc",
      "displayName": "Amy's Profile",
      "userId": "user-123",
      "createdAt": "2026-02-04T03:18:40.268Z"
    }
  ]
}
```

### GET /api/v1/profiles/:id

Get details for a specific profile.

**Success Response (200 OK)**
```json
{
  "profile": {
    "id": "12345678-1234-1234-8234-123456789abc",
    "displayName": "Amy's Profile",
    "userId": "user-123",
    "createdAt": "2026-02-04T03:18:40.268Z"
  }
}
```

**Error Responses:**

*404 Not Found*
```json
{
  "error": "Profil nicht gefunden.",
  "code": "PROFILE_NOT_FOUND"
}
```

*403 Forbidden*
```json
{
  "error": "Keine Berechtigung für dieses Profil.",
  "code": "PROFILE_UNAUTHORIZED"
}
```

### DELETE /api/v1/profiles/:id

Delete a profile and all associated data.

**Success Response (200 OK)**
```json
{
  "message": "Profil wurde gelöscht."
}
```

## Endpoints

### Sample Capture

#### POST /api/v1/dgs/samples
Upload a single labeled gesture sample. The body must contain 42 normalized landmark triplets.

**Request Body**
```json
{
  "label": "wink",
  "profileId": "amy",
  "landmarks": [[0.1, 0.2, 0.0], [0.3, 0.4, 0.0], [0.5, 0.6, 0.1]]
}
```

**Success Response (200 OK)**
```json
{ "status": "ok" }
```

**Error Response:**

*400 Bad Request - Invalid landmarks*
```json
{
  "error": "Ungültige Landmark-Daten.",
  "code": "INVALID_SAMPLE"
}
```

#### POST /api/v1/dgs/sample-bundles
Upload a ZIP archive produced by the mobile client containing multiple samples plus `metadata.json`. The server persists the bundle and (if configured) schedules a follow-up training job.

**Request Headers**
```
Content-Type: multipart/form-data
```

**Form Data**
- `bundle`: ZIP file containing `metadata.json`, `landmarks.json`, and `still.jpg`

**Success Response (201 Created)**
```json
{
  "status": "ok",
  "bundleId": "bundle-123",
  "samplesIngested": 5
}
```

**Error Responses:**

*400 Bad Request - Missing files*
```json
{
  "error": "Bundle muss landmarks.json enthalten.",
  "code": "INVALID_BUNDLE"
}
```

#### GET /api/v1/dgs/training-quality
Liefert die zuletzt vom Quality Gate abgelehnten Trainingsaufnahmen für ein Profil.

**Query Parameter**
- `profileId` (optional): Profilkennung für gefilterte Antworten. Ohne `profileId` werden nur Einträge aus autorisierten Profilen zurückgegeben.
- `limit` (optional): Maximale Anzahl Einträge (`1-200`, Standard `50`).

**Success Response (200 OK)**
```json
{
  "items": [
    {
      "bundleId": "bundle-123",
      "label": "HALLO",
      "profileId": "profil-1",
      "reasons": ["too_few_frames"],
      "metrics": {
        "frameCount": 6,
        "handCoverage": 0.4,
        "poseCoverage": 0.2,
        "faceCoverage": 0.1
      },
      "recordedAt": "2024-05-28T12:03:11Z"
    }
  ]
}
```

**Error Responses**

*400 Bad Request - Invalid query parameters*
```json
{
  "error": "Ungültige Anfrageparameter",
  "code": "INVALID_QUERY",
  "issues": []
}
```

*403 Forbidden - Not authorized for profile*
```json
{
  "error": "Kein Zugriff auf dieses Profil.",
  "code": "PROFILE_UNAUTHORIZED"
}
```

### Corrections & Negative Samples

#### POST /api/v1/corrections
Append a correction event generated by the caregiver workflow.

**Request Body**
```json
{
  "gestureId": "hello",
  "correctedLabel": "hallo",
  "profileId": "amy",
  "timestamp": "2026-02-04T03:18:40.268Z"
}
```

**Success Response (200 OK)**
```json
{ "status": "ok" }
```

#### POST /api/v1/negative-samples
Record a negative example that should be excluded from future training jobs.

**Request Body**
```json
{
  "gestureId": "invalid",
  "profileId": "amy",
  "reason": "accidental_capture"
}
```

**Success Response (200 OK)**
```json
{ "status": "ok" }
```

Both endpoints accept JSON payloads following the types defined in `server/src/types.ts` and return `{"status":"ok"}` on success.

### Crash Reporting

#### POST /api/v1/crash-reports
Upload crash diagnostics from the mobile app. Payloads are stored under `data/crash-reports/` for manual inspection.

**Request Body**
```json
{
  "error": "Error message",
  "stack": "Stack trace",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2026-02-04T03:18:40.268Z"
}
```

**Success Response (200 OK)**
```json
{ "status": "ok" }
```

### Training

#### POST /train-model
Schedule a training job with an explicit list of samples. When called without samples the server falls back to any staged bundles.

**Request Body**
```json
{
  "samples": [
    {
      "gestureDefinitionId": "hello",
      "profileId": "amy",
      "landmarkData": [[0.1, 0.2, 0.0], [0.3, 0.4, 0.0], "…"]
    }
  ],
  "trigger": "manual"
}
```

**Success Response (202 Accepted)**
```json
{
  "status": "running",
  "jobId": "train_123",
  "pollUrl": "/api/v1/train-status/train_123",
  "message": "Trainingsauftrag gestartet",
  "queueDepth": 0,
  "retryAfterMs": 1000
}
```

When the job is queued, the server also emits a `Retry-After` header (seconds) to hint at how soon to poll.

**Error Response:**

*500 Internal Server Error - Training failed*
```json
{
  "error": "Training fehlgeschlagen.",
  "code": "TRAINING_FAILED",
  "details": {
    "stderr": "Error output from Python trainer"
  }
}
```

#### GET /api/v1/train-status/:id
Retrieve the latest job metadata including status, progress, metrics, and timestamps. Returns `404` if the job id is unknown.

**Success Response (200 OK)**
```json
{
  "status": "completed",
  "jobId": "train_123",
  "progress": 100,
  "metrics": {
    "accuracy": 0.95,
    "samples": 1000
  },
  "startedAt": "2026-02-04T03:18:40.268Z",
  "completedAt": "2026-02-04T03:20:15.123Z"
}
```

**Status Values:**
- `queued`: Job is waiting in queue
- `running`: Job is currently executing
- `completed`: Job finished successfully
- `failed`: Job encountered an error
- `cancelled`: Job was cancelled by user

#### GET /api/v1/train-status
Fallback endpoint used when no job id is supplied. Always returns `{ "status": "unknown" }`.

### Model Serving

#### GET /latest-mlp-model
Download the latest trained model (NPZ). Accepts an optional `profileId` query parameter to fetch a personalized model.

**Query Parameters:**
- `profileId` (optional): Profile UUID to fetch personalized model

**Success Response (200 OK)**
- Content-Type: `application/octet-stream`
- Headers:
  - `X-Model-Version`: Model version string
  - `X-Model-Checksum`: SHA-256 checksum
  - `X-Model-Size`: File size in bytes
  - `Cache-Control`: Caching policy

**Error Responses:**

*404 Not Found*
```json
{
  "error": "Modell nicht gefunden.",
  "code": "MODEL_NOT_FOUND"
}
```

#### GET /model-version
Return the current model bundle version and the path used by the mobile client to request it.

**Success Response (200 OK)**
```json
{ "version": "1.0.0", "modelPath": "latest-mlp-model" }
```

#### GET /model-metadata
Return metadata for the requested model including file size and SHA-256 checksum.

**Query Parameters:**
- `profileId` (optional): Profile UUID to get personalized model metadata

**Success Response (200 OK)**
```json
{ 
  "version": "1.0.0", 
  "size": 123456, 
  "sha256": "abc123...",
  "createdAt": "2026-02-04T03:18:40.268Z",
  "labels": ["hello", "goodbye", "yes", "no"]
}
```

## Metacom Sentence Improvement

### POST /api/v1/metacom/sentence-improve
Improves a composed Metacom sentence using the server-side LLM helper (German-only output).

**Request Body**
```json
{
  "sentence": "Ich Brot",
  "locale": "de"
}
```

**Success Response (200 OK)**
```json
{
  "improvedSentence": "Ich esse Brot."
}
```

**Error Responses:**

*401 Unauthorized*
```json
{
  "error": "Bitte zuerst anmelden."
}
```

*400 Bad Request*
```json
{
  "error": "Ungültige Satzdaten."
}
```

*503 Service Unavailable*
```json
{
  "error": "Satzverbesserung ist gerade nicht verfügbar."
}
```

### Validation

#### Validation endpoints
The previous `/api/gesture/validate-vision` route has been retired. Validation now happens entirely on-device in the webapp gesture pipeline and does not require a network call.
