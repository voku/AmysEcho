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
- `event` (string, optional) — e.g., `recognizer_init`, `frame_latency`, `server_fallback`, `classify_landmarks`
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
Upload hand landmarks and trigger model training.

**Body**
```json
{ "landmarks": [...] }
```

**Response**
```json
{ "status": "ok" }
```

### GET /model-version
Fetch the current model version and path information.

**Response**
```json
{ "version": "1.0.0", "modelPath": "latest-model" }
```

### GET /latest-model
Download the latest trained gesture model file.

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

### POST /api/classify-landmarks
Send an array of 21 hand landmarks for server-side classification. The server forwards the landmarks to a cloud model and falls back to a lightweight local classifier if the request fails.

**Body**
```json
{ "landmarks": [...] }
```

**Response**
```json
{ "label": "wave", "confidence": 0.92, "processedBy": "cloud" }
```

### POST /classify
Legacy endpoint that first attempts classification with a local model and then falls back to the remote pipeline. New clients should use `/api/classify-landmarks`.

**Body**
```json
{ "landmarks": [...] }
```

**Response**
```json
{ "label": "wave", "confidence": 0.92, "processedBy": "local" }
```

