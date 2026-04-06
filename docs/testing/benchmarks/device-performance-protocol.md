# Device Performance Protocol — Amy's Echo

**Created:** 2026-03-27
**Status:** Protocol template — run first cycle on target devices and publish results.

## 1) Purpose

Establish a repeatable measurement protocol for real-device performance so
infrastructure and runtime decisions (worker offload, camera resolution,
model size) are evidence-driven. Every published result must follow this
protocol to be comparable across devices and dates.

---

## 2) Target device matrix

Priority tiers reflect Amy's caregiver environment:

| Device | Tier | Category | Notes |
|--------|------|----------|-------|
| Samsung Galaxy Tab A7 Lite | P0 | Low-end tablet | Primary caregiver device |
| Moto G Power (2023+) | P0 | Budget phone | Common budget Android |
| MacBook Air M1 | P1 | Laptop | Development/demo baseline |
| iPhone SE (3rd gen) | P1 | Phone | Low-end iOS baseline |
| iPad 9th gen | P2 | Tablet | Mid-range iOS tablet |

---

## 3) Scenarios to measure

### 3.1 First launch (cold start)

Measure from page load to first gesture recognition result.

| Step | What to measure |
|------|----------------|
| Page load → camera ready | Time to `getUserMedia` success (ms) |
| Camera ready → MediaPipe loaded | WASM/model download + init (ms) |
| MediaPipe loaded → first detection | Time to first `GestureRecognizerResult` (ms) |
| **Total cold-start** | Sum of above (ms) |

### 3.2 Route switch (warm)

Navigate away from recognition view and back. Measure re-init latency.

| Step | What to measure |
|------|----------------|
| Route leave → camera stop | Camera stream teardown (ms) |
| Route enter → camera restart | `getUserMedia` re-acquisition (ms) |
| Camera restart → first detection | Re-init pipeline (ms) |
| **Total warm restart** | Sum of above (ms) |

### 3.3 Camera flip (front ↔ rear)

Trigger `facingMode` switch while recognition is active.

| Step | What to measure |
|------|----------------|
| Flip trigger → stream switch | Time to new `MediaStream` (ms) |
| Stream switch → first detection | Pipeline re-init (ms) |
| **Dropped frames during flip** | Count of missed detection windows |

### 3.4 Sustained session (20-minute run)

Continuous recognition at target frame rate over 20 minutes.

| Metric | How to capture |
|--------|---------------|
| **FPS (p50 / p95)** | Sample every 5 s via `SmoothedFpsMeter` |
| **Frame latency p50 / p95** | Per-frame `performance.now()` delta (ms) |
| **Dropped frame %** | Frames where detection returned null / total |
| **Memory (JS heap)** | `performance.memory.usedJSHeapSize` every 60 s (Chrome) |
| **Thermal state** | Device-reported or subjective (cool / warm / hot / throttled) |
| **Battery drain** | Start % − End % over 20 min |

---

## 4) Measurement setup

### 4.1 Browser / OS

- Chrome stable (latest) on Android and macOS.
- Safari stable (latest) on iOS.
- Record exact browser version and OS version.

### 4.2 Network

- WiFi (local, low-latency) for model download consistency.
- Note: after first load, model is cached; subsequent runs are offline-capable.

### 4.3 Environment

- Indoor, consistent lighting (no backlighting).
- Device on stand or held steady at ~50 cm from signer.
- No other CPU-intensive apps running.

### 4.4 Build

- Production build (`npm run build --prefix webapp`).
- Served via local HTTPS (e.g. `npx serve webapp/dist`).
- Record git commit SHA.

---

## 5) Data collection procedure

For each device × scenario:

1. **Prepare:** Fresh browser tab, clear performance timeline.
2. **Record:** Start DevTools Performance recording (or equivalent).
3. **Execute:** Run the scenario exactly as described (§3).
4. **Capture:** Export performance trace; note manual observations.
5. **Repeat:** Minimum 3 runs per scenario per device. Report median values.

### 5.1 Automated metrics (where available)

Entry points for instrumented metrics:

| Metric | Source |
|--------|--------|
| FPS | `webapp/src/gesture/utils/SmoothedFpsMeter.ts` |
| Frame latency | `webapp/src/hooks/useSignLanguageDetector.ts` detection loop timing |
| Camera state | `webapp/src/hooks/useCamera.ts` event timestamps |
| Memory | `performance.memory` API (Chrome only) |
| Battery | `navigator.getBattery()` API (Chrome Android) |

### 5.2 Manual observations

Record per-run:

- Visible UI jank (yes/no, description).
- Thermal state at 0 / 5 / 10 / 15 / 20 min marks.
- Any recognition accuracy drop noticed during sustained run.

---

## 6) Result artefacts

Store under `docs/testing/benchmarks/results/<YYYY-MM-DD>/`:

```
results/2026-04-XX/
├── commit.sha
├── device_matrix.md           # Exact device/OS/browser versions
├── cold_start_results.csv     # device, run, step, duration_ms
├── warm_restart_results.csv
├── camera_flip_results.csv
├── sustained_session_summary.csv # device,mode,fps_p50,fps_p95,drop_rate_pct,frame_latency_p50_ms,frame_latency_p95_ms,memory_growth_mb,battery_drain_pct,thermal_state_20min
├── sustained_session/
│   ├── galaxy_tab_a7_fps.csv  # timestamp_s, fps
│   ├── galaxy_tab_a7_latency.csv
│   ├── galaxy_tab_a7_memory.csv
│   ├── moto_g_power_fps.csv
│   └── ...
├── thermal_battery_log.csv    # device, minute, thermal_state, battery_pct
└── summary.md                 # Aggregated tables, charts, recommendations
```

---

## 7) Decision criteria

### 7.1 Pass / fail thresholds

| Metric | P0 devices | P1 devices |
|--------|-----------|-----------|
| Cold-start total | ≤ 5 000 ms | ≤ 3 000 ms |
| Warm restart total | ≤ 2 000 ms | ≤ 1 000 ms |
| Camera flip total | ≤ 2 000 ms | ≤ 1 000 ms |
| Sustained FPS p50 | ≥ 15 fps | ≥ 25 fps |
| Sustained FPS p95 | ≥ 8 fps | ≥ 15 fps |
| Dropped frames (20 min) | ≤ 15 % | ≤ 5 % |
| Memory growth (20 min) | ≤ 50 MB | ≤ 30 MB |
| Battery drain (20 min) | ≤ 10 percentage points | ≤ 8 percentage points |
| Thermal state at 20 min | ≤ warm | ≤ cool |

### 7.2 Escalation triggers

If any P0 metric fails:

1. File a performance issue referencing this protocol.
2. Link the specific result artefact.
3. Prioritise fix before next release gate.

---

## 8) Release gate mapping for APR-P0-4

The table below is the **release authority** for APR-P0-4 go/no-go decisions.
Use measured medians from §5 and compare them against §7 thresholds.

| Gate | Metric source | P0 decision rule | P1 decision rule |
|------|---------------|------------------|------------------|
| G1 — Startup readiness | §3.1 + §3.2 | Cold-start and warm restart must both pass | Cold-start and warm restart must both pass |
| G2 — Real-time loop continuity | §3.4 FPS + drop rate | Sustained FPS p50/p95 and dropped-frame % must all pass | Sustained FPS p50/p95 and dropped-frame % must all pass |
| G3 — Long-session stability | §3.4 memory + thermal + battery | Memory growth, thermal state, and battery drain must all pass | Memory growth, thermal state, and battery drain must all pass |
| G4 — Camera transition resilience | §3.3 | Camera flip re-init passes and dropped frames stay within P0 drop-rate threshold | Camera flip re-init passes and dropped frames stay within P1 drop-rate threshold |

### 8.1 Go/no-go rubric

- **GO:** all P0 gates pass on every required P0 device in the matrix.
- **CONDITIONAL GO:** all P0 gates pass, but one or more P1 gates fail; release can proceed with a tracked P1 remediation item.
- **NO-GO:** any required P0 gate fails on any required P0 device.

### 8.2 Required interpretation output format

Each benchmark summary must include:

1. A per-device gate verdict table (`Pass` / `Fail`) for G1–G4.
2. A fleet verdict (`GO`, `CONDITIONAL GO`, or `NO-GO`) with one-sentence rationale.
3. Explicit remediation owners and target dates for every failed gate.

### 8.3 Reproducible evaluator command

After the result artefacts are committed, generate the canonical summary + gate interpretation:

```bash
python3 scripts/evaluate_device_protocol_results.py \
  --result-dir docs/testing/benchmarks/results/<YYYY-MM-DD> \
  --gate-mode main_thread
```

The evaluator writes:

- `summary.json`
- `summary.md`
- `apr-p0-4-gate-interpretation.md`

If worker-offload rows are included in `sustained_session_summary.csv` with `mode=worker`,
the generated `summary.md` will also include a mode-comparison appendix for APR-P0-1.

---

## 9) Relationship to worker-offload decision (APR-P0-1)

The sustained-session scenario (§3.4) should be run **twice** per device:

1. Main-thread detection mode (current production path).
2. Worker-offload detection mode (prototype in `DetectionWorker.ts`).

Compare p50/p95 latency, FPS, thermal, and battery between modes to inform
the keep/iterate/reject decision documented in
`docs/testing/benchmarks/worker-offload-2026-03-25.md`.
