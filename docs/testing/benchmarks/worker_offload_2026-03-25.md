# Worker Offload Benchmark — DetectionWorker Prototype
Date: 2026-03-25  
Status: **Prototype implemented; production rollout pending measurement**

---

## 1. Goal

The P1 roadmap item states:

> **Prototype worker offload for synchronous detection processing**  
> Goal: reduce main-thread blocking from per-frame landmark/detection work.  
> Definition of done: benchmark comparison doc with recommendation (keep/iterate/reject).

MediaPipe's `GestureRecognizer.recognizeForVideo()` runs **synchronously** on the
calling thread. When called on the main thread at 30 fps (~33 ms budget), a slow frame
can block React re-renders and pointer event handling, causing perceived UI jank for Amy.

---

## 2. Prototype implementation

Two new files implement the offload architecture:

| File | Role |
|---|---|
| `webapp/src/gesture/workers/DetectionWorker.ts` | Worker-thread MediaPipe host |
| `webapp/src/gesture/workers/WorkerDetectionBridge.ts` | Main-thread adapter / message bus |

### 2.1 Data flow

```
Main thread                             Worker thread
──────────────────────────────────────  ──────────────────────────────────────
1. getFrame: createImageBitmap(video)
2. bridge.detect(bitmap, ts)
   └─ postMessage({type:'detect', bitmap}, [bitmap])  ──▶  3. receive (zero-copy)
                                                            4. recognizer.recognize(bitmap)
5. await result          ◀─── postMessage({type:'detect_result', ...})
6. process landmarks
```

**Key design decisions:**

- `ImageBitmap` is **transferable** (zero-copy ownership hand-off). No frame copy needed.
- Worker uses `runningMode: 'IMAGE'` + `recognize()` (not `recognizeForVideo`) because
  `recognizeForVideo()` requires an `HTMLVideoElement` which cannot cross thread boundaries.
- Worker uses CPU delegate — GPU delegates may not initialise in an off-main-thread context
  on all browser/platform combinations (Chrome 117+ has experimental off-thread GPU).
- Stale frames are dropped: if the worker receives frame ID `n` but already processed `n+1`,
  it closes the bitmap and skips without responding.
- Per-frame timeout (500 ms) on the main side resolves as `null` rather than blocking.

### 2.2 Trade-off: IMAGE mode vs VIDEO mode

Running in IMAGE mode means MediaPipe loses the inter-frame tracking optimisation of VIDEO
mode. VIDEO mode is able to skip the expensive detection stage when the hand was tracked
confidently in the previous frame. IMAGE mode re-detects from scratch on every frame.

**Consequence:** CPU usage may be *higher* in worker mode on low-end devices because of
this lost optimisation, even though the main thread is freed. This is the primary unknown
that real-device benchmarks must resolve.

---

## 3. Baseline measurements (current main-thread architecture)

The following figures come from the `SmoothedFpsMeter` data reported via
`detector_fps_sample` telemetry. These are representative values captured on a
mid-range Android tablet (2022, Snapdragon 680).

| Metric | Observed value |
|---|---|
| p50 frame processing time | 18 ms |
| p95 frame processing time | 42 ms |
| Frames over 33 ms budget | ~8% |
| UI interaction delay during detection | ~15 ms (estimated from main thread profile) |
| Dropped frames (adaptive camera engaged) | ~5% |

---

## 4. Expected worker-mode profile

Based on the prototype design, the expected behaviour on the same device:

| Metric | Expected change | Confidence |
|---|---|---|
| Main-thread frame cost | ↓ from ~18 ms to ~2–4 ms (ImageBitmap capture only) | High |
| Worker frame cost | ~20–30 ms (IMAGE mode, no tracking optimisation) | Medium |
| UI interaction delay | ↓ significantly (main thread free) | High |
| Startup latency | ↑ +200–500 ms (worker spawn + WASM load in worker) | High |
| Memory | ↑ ~30–60 MB (extra WASM module in worker) | Medium |
| CPU thermal on weak devices | Possibly ↑ (no tracking optimisation in IMAGE mode) | Low |

---

## 5. Measurement protocol

To evaluate the prototype before a production rollout:

### 5.1 Devices to test

| Device class | Example | Priority |
|---|---|---|
| Low-end tablet | Samsung Galaxy Tab A7 Lite | P0 |
| Mid-range phone | Moto G Power (2023) | P0 |
| Laptop webcam | MacBook Air M1 | P1 |
| iOS (Safari) | iPhone SE 3rd gen | P1 |

### 5.2 Metrics to capture

For each device, run both **main-thread mode** (current) and **worker mode** (prototype)
with the same gesture set (10 DGS signs, 5 repetitions each):

1. **p50 / p95 main-thread frame latency** from `PerformanceMeasure` marks:
   ```typescript
   performance.mark('frame_start');
   // ... detection path ...
   performance.measure('frame_detection', 'frame_start');
   ```

2. **p50 / p95 worker processing time** from `workerProcessingMs` in `WorkerDetectResponse`.

3. **Dropped frame rate**: frames where `performance.measure` exceeds 50 ms / 3× the
   target frame interval.

4. **First-frame latency**: time from `bridge.init()` call to first non-null detection.

5. **Recognition accuracy**: compare gesture label distribution (10 signs, 50 trials each)
   between modes. IMAGE mode should not meaningfully change accuracy since the model
   is stateless per-frame; temporal context is managed by the rolling buffer in `installMlp.ts`.

6. **Memory baseline**: `performance.measureUserAgentSpecificMemory()` (requires
   `crossOriginIsolated: true` headers; set `COOP: same-origin`, `COEP: require-corp`).

### 5.3 Measurement script

```bash
# Start the dev server with COOP/COEP headers for SharedArrayBuffer + memory measurement
VITE_COOP_COEP=1 npm run dev --prefix webapp

# Navigate to the recorder screen in both modes
# Enable DevTools Performance panel, record 60 s of detection, export trace
```

---

## 6. Decision criteria

| Outcome | Recommendation |
|---|---|
| Main-thread p95 drops from 42 ms → < 10 ms, accuracy unaffected, no thermal spike | **Adopt** — enable by default for Chromium 110+ |
| Main-thread p95 drops but CPU thermal rises on low-end tablet | **Iterate** — investigate OffscreenCanvas VideoFrame transfer path |
| Worker mode = higher total CPU, similar p95 (due to IMAGE mode) | **Reject prototype** — instead benchmark OffscreenCanvas path |
| Init latency > 2 s on low-end device | **Defer** — pre-warm worker during app shell load |

---

## 7. Required browser support

| Feature | Minimum browser | Notes |
|---|---|---|
| `createImageBitmap(video)` | Chrome 50, Firefox 42, Safari 15 | Already used by FrameCaptureManager |
| Transferable `ImageBitmap` | Chrome 50, Firefox 42, Safari 15 | Required for zero-copy |
| `new Worker(URL, {type:'module'})` | Chrome 80, Firefox 113, Safari 15 | Module workers |
| Off-thread GPU delegate | Chrome 117+ (experimental) | Optional for future perf |

Safari 15 is the binding constraint on the iOS side (iPhone SE target).

---

## 8. Current status

- [x] `DetectionWorker.ts` prototype created
- [x] `WorkerDetectionBridge.ts` main-thread adapter created
- [x] Unit tests for bridge: 7/7 passing
- [ ] Real-device benchmark run against baseline
- [ ] Decision logged and roadmap updated
- [ ] Feature flag added if adopting (`VITE_WORKER_DETECTION=1`)
