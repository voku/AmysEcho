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

### POST /classify
Classify a gesture from raw landmarks. Falls back to cloud recognition when the local model is unavailable.

**Body**
```json
{ "landmarks": [...] }
```

**Response**
```json
{ "label": "wave", "confidence": 0.92 }
```

