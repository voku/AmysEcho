# API Documentation

This document describes the backend server endpoints used by Amy's Echo. All endpoints require an `Authorization` header in the form `Bearer <API_TOKEN>`.

## Rate Limiting

Two rate limiters are applied:
- **/dialog**: Limited by `DIALOG_LIMIT` (default `60` requests per minute).
- **/api/* and other endpoints**: Limited by `API_LIMIT` (default `120` requests per minute).

## Endpoints

### GET /api/analytics/profiles
Return the list of gesture profiles available.

**Response**
```json
[
  { "id": "profile1", "name": "Child" }
]
```

### GET /api/analytics/corrections
Retrieve correction events. Optional query parameter `profileId` filters by profile.

**Response**
```json
[
  {
    "predictedGesture": "wave",
    "actualGesture": "clap",
    "confidence": 0.42,
    "timestamp": 1700000000000
  }
]
```

### GET /api/analytics/usage-rates
Retrieve symbol usage counts. Optional query parameter `profileId` filters by profile.

**Response**
```json
[
  { "symbolId": "hello", "usageCount": 42 }
]
```

### GET /api/analytics/training-trends
Return learning analytics for gesture training progress.

**Response**
```json
[
  {
    "gestureDefinitionId": "wave",
    "successRate24h": 0.85,
    "successRate7d": 0.92,
    "avgConfidenceScore": 0.88,
    "improvementTrend": 0.03,
    "lastCalculated": 1700000000000
  }
]
```

### GET /api/analytics/export
Export analytics data as CSV. Query parameter `type` selects `corrections`, `usage`, or `training`. Optional `profileId` filters by profile.

### GET /api/analytics/summary
Return aggregated metrics such as correction rate, uncertainty ratio, median latency, and top misclassifications. `medianLatencyMs` is `null` when no telemetry data is available, and `topMisclassifications` is an array of objects describing the most common errors.

**Response**
```json
{
  "correctionRate": 0.1,
  "uncertaintyRatio": 0.05,
  "medianLatencyMs": 120,
  "topMisclassifications": [
    { "predicted": "wave", "actual": "clap", "count": 3 }
  ]
}
```

### POST /api/telemetry
Submit telemetry events recording gesture processing metrics and fallback usage. Accepts a single event object or an array of events. Returns `202 Accepted`.

Each event includes:
- `latencyMs` (number)
- `timestamp` (number)
- `event` (string, optional) — e.g., `recognizer_init`, `frame_latency`
- `source` (string, optional) — client module sending the event

**Body**
```json
[
  { "event": "frame_latency", "latencyMs": 33, "timestamp": 1700000000000, "source": "webview-gesture-detector" }
]
```

**Response**
```json
{ "status": "ok" }
```

### POST /api/corrections
Log a caregiver correction when the system misclassifies a gesture. Returns `202 Accepted`.

**Body**
```json
{ "gesture": "wave" }
```

**Response**
```json
{ "status": "queued" }
```

### POST /api/negative-samples
Record a negative sample for future model training. Returns `202 Accepted`.

**Body**
```json
{ "gesture": "random" }
```

**Response**
```json
{ "status": "queued" }
```

### POST /dialog
Ask the dialog engine for caregiver suggestions.

**Body**
```json
{
  "input": "hello",
  "context": ["previous", "messages"]
}
```

**Response**
```json
{
  "nextWords": ["friend"],
  "caregiverPhrases": ["Good job!"]
}
```

### POST /train-model
Upload labeled hand landmark samples and trigger model training.

**Body**
```json
{
  "samples": [
    { "gestureDefinitionId": "wave", "landmarkData": [[0.1,0.2,0], ...21] },
    { "gestureDefinitionId": "wave", "landmarkData": [[0.3,0.4,0], ...21] }
  ]
}
```

**Response**
```json
{ "status": "queued", "jobId": "abc123" }
```

Validation
- Expects `samples` to be an array of objects with `gestureDefinitionId` (string) and `landmarkData` (array).
- Responds with `400` if the payload is malformed.

Example error response
```json
{ "error": "Invalid samples payload. Expecting an array of objects with gestureDefinitionId (string) and landmarkData (array)." }
```

Optional fields
- `profileId` may be included per sample to support profile-aware training. Currently optional and ignored by validators.

### POST /dialog
Return LLM-powered word and phrase suggestions.

Body
```json
{ "input": "hi", "context": ["play"], "language": "de", "age": 4 }
```

Response
```json
{ "nextWords": ["friend"], "caregiverPhrases": ["Good job!"] }
```

### GET /model-version
Fetch the current model version and path information.

**Response**
```json
{ "version": "1.0.0", "modelPath": "latest-model" }
```

### GET /latest-model
Download the latest trained gesture model file.

Query parameter `profileId` returns a profile-specific model if available.

Note: As of the centroid-based pipeline, this returns a JSON payload representing the
centroid model `{ type: "centroid_model", centroids, counts, updatedAt }`. Clients may
continue to treat this as an opaque file and verify via `/model-metadata`.

### GET /model-metadata
Return metadata about the current model file.

Query parameter `profileId` mirrors `/latest-model` for profile-specific metadata.

**Response**
```json
{ "version": "1.0.0", "size": 1234, "sha256": "<hash>" }
```

### POST /analytics
Store high level analytics.

**Body**
```json
{ "successRate7d": 0.9, "improvementTrend": 0.2 }
```

**Response**
```json
{ "status": "ok" }
```

### GET /analytics
Retrieve stored analytics summary.

**Response**
```json
{
  "id": "default",
  "gestureDefinitionId": "default",
  "successRate24h": 0,
  "successRate7d": 0.9,
  "avgConfidenceScore": 0,
  "improvementTrend": 0.2,
  "lastCalculated": 1700000000000
}
```

### POST /api/classify-landmarks (optional)
This endpoint is deprecated for the mobile app, which performs on-device classification via MediaPipe Tasks JS. It remains available for experiments and server-side analytics.

### POST /classify (legacy)
Legacy endpoint for historical reference. Not used by the current mobile client.
