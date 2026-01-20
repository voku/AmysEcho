# Bandwidth & Latency Budgets (Planned)

This document defines target budgets for the streaming pipeline and the end-to-end training loop.

## Streaming Budgets

- **Target FPS:** 30
- **Payload size per frame:** < 35 KB
- **Client→Server latency:** < 150 ms (p50), < 300 ms (p95)
- **Dropped frame rate:** < 5%

## Training Loop Budgets

- **Capture → Upload:** < 10 s on 4G (median)
- **Upload → Train start:** < 2 min
- **Train → Model download:** < 5 min

## Monitoring Plan

Track and alert on:

- `captureToUploadMs`
- `uploadToTrainStartMs`
- `trainToDownloadMs`
- `streamLatencyP50/P95`
- `payloadSizeAvg`
