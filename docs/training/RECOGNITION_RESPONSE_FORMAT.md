# Recognition Response Format (Planned)

This document defines the server response contract for gesture recognition results. It focuses on per-token timestamps, confidence scores, and structured error codes so the client can render aligned highlights and reliable feedback.

## Success Response

```json
{
  "type": "recognition_result",
  "schemaVersion": 1,
  "requestId": "req-123",
  "receivedAt": 1716897791123,
  "tokens": [
    {
      "token": "hilfe",
      "startMs": 0,
      "endMs": 520,
      "confidence": 0.92
    },
    {
      "token": "bitte",
      "startMs": 540,
      "endMs": 980,
      "confidence": 0.81
    }
  ],
  "overallConfidence": 0.87,
  "latencyMs": 42,
  "model": {
    "profileId": "amy-1",
    "version": "2024-10-15",
    "sha256": "..."
  }
}
```

### Field Notes

- `tokens`: ordered array of recognized gloss tokens.
- `startMs` / `endMs`: millisecond offsets aligned to the streamed frame timestamps for the recognition window.
- `confidence`: per-token confidence score in `[0..1]`.
- `overallConfidence`: aggregate confidence for the full response.
- `latencyMs`: server-side processing latency for the request.

## Error Response

```json
{
  "type": "recognition_error",
  "schemaVersion": 1,
  "requestId": "req-123",
  "error": {
    "code": "LANDMARKS_MISSING",
    "message": "Insufficient landmark coverage for recognition.",
    "details": {
      "missingModalities": ["hands"],
      "minCoverage": 0.6,
      "observedCoverage": 0.2
    }
  }
}
```

### Error Codes

| Code | Meaning | Notes |
| --- | --- | --- |
| `LANDMARKS_MISSING` | Required modalities missing | Include `missingModalities` in `details`. |
| `LOW_CONFIDENCE` | Confidence below threshold | Provide `threshold` and `observedConfidence`. |
| `WINDOW_TIMEOUT` | Sequence window incomplete | Include expected vs. observed frame count. |
| `MODEL_UNAVAILABLE` | Model not loaded | Include `profileId` and expected model version. |
| `INTERNAL_ERROR` | Server error | Log the server-side error id. |

## Compatibility

- Clients must ignore unknown fields for forward compatibility.
- Schema changes must increment `schemaVersion`.
