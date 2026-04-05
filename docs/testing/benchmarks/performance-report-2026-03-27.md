# Performance Benchmark Report — 2026-03-27

**Commit:** `483e73b0` (copilot/work-on-open-todos-again)
**Date:** 2026-03-27T21:34:40Z
**Environment:** CI runner (Azure), AMD EPYC 7763 64-Core, 15 GiB RAM
**Node:** v24.14.0 | **Browser:** Headless Chrome 146.0.0.0

> **Note:** This benchmark was executed on a CI-class cloud VM, not a target
> caregiver device. Results represent server-side and static-asset baselines.
> Real-device measurements (tablet, phone) should follow the protocol in
> `docs/testing/benchmarks/device-performance-protocol.md`.

---

## 1) Webapp Bundle Size

| Asset | Raw | Gzipped | Ratio |
|-------|-----|---------|-------|
| `index-*.js` (app) | 472 KB | 139 KB | 28 % |
| `vendor-react-*.js` | 226 KB | 74 KB | 31 % |
| `vendor-*.js` (other) | 24 KB | 11 KB | 43 % |
| `index-*.css` | 95 KB | 15 KB | 15 % |
| **Total (transferable)** | **817 KB** | **239 KB** | **29 %** |

Source maps add 1.5 MB but are not transferred to clients in production.

---

## 2) Browser Navigation Timing (cold load)

Measured via `performance.getEntriesByType('navigation')` on the production build served locally.

| Metric | Value |
|--------|-------|
| Time to First Byte (TTFB) | 5 ms |
| DOM Interactive | 22 ms |
| DOM Content Loaded | 69 ms |
| Load Complete | 69 ms |
| Resources loaded | 8 |
| Total transfer | 240 KB |
| JS heap after load | 6 MB |

**Assessment:** Cold-start page load completes in under 70 ms. For caregiver
devices on WiFi this translates to roughly 200–500 ms including network
latency. Well within the ≤ 5 000 ms P0 threshold from the device performance
protocol.

---

## 3) Server API Latency (5 iterations each, local loopback)

### Unauthenticated Endpoints

| Endpoint | Avg | Min | Max | p95 |
|----------|-----|-----|-----|-----|
| `GET /health` | 0.9 ms | 0.8 ms | 1.2 ms | 1.2 ms |
| `GET /labels` | 0.9 ms | 0.9 ms | 1.1 ms | 1.1 ms |
| `POST /auth/login` | 238 ms | 237 ms | 239 ms | 239 ms |
| `POST /auth/register` | 265 ms | — | — | — |

> Login and registration are intentionally slow due to bcrypt password hashing
> (cost factor 12). This is a security feature, not a performance issue.

### Authenticated Endpoints

| Endpoint | Avg | Min | Max | p95 |
|----------|-----|-----|-----|-----|
| `GET /profiles` | 0.7 ms | 0.6 ms | 1.0 ms | 1.0 ms |
| `GET /symbols` | 0.7 ms | 0.6 ms | 0.8 ms | 0.8 ms |
| `GET /models/latest` (global) | 26.9 ms | 25.7 ms | 28.6 ms | 28.6 ms |
| `GET /models/latest` (profile) | 26.9 ms | 26.2 ms | 28.2 ms | 28.2 ms |
| `POST /profiles` (create) | 8 ms | — | — | — |
| `POST /auth/refresh` | 1.0 ms | 0.6 ms | 2.5 ms | 2.5 ms |

> Model delivery (~27 ms) includes NPZ file read + header computation. This
> is the heaviest authenticated endpoint but still well under the 150 ms p50
> target from `docs/operations/bandwidth-latency-budgets.md`.

### Static Assets (Vite preview)

| Asset | Avg | p95 |
|-------|-----|-----|
| HTML (`/`) | 0.7 ms | 0.9 ms |
| App JS bundle (483 KB) | 1.5 ms | 1.9 ms |
| React vendor (231 KB) | 1.2 ms | 2.2 ms |
| CSS (96 KB) | 0.7 ms | 0.7 ms |

---

## 4) Client-Side Route Navigation

Measured via `fetch()` from the browser to the local Vite preview server.
All routes return HTTP 200 within the SPA — React handles routing client-side.

| Route | HTTP Status | Fetch Time |
|-------|-------------|------------|
| `/` (Kamera) | 200 | 6 ms |
| `/lernen` | 200 | 4 ms |
| `/verlauf` | 200 | 4 ms |
| `/symbole` | 200 | 4 ms |
| `/uebersicht` | 200 | 4 ms |
| `/einstellungen` | 200 | 4 ms |
| `/hilfe` | 200 | 4 ms |
| `/betreuung` | 200 | 4 ms |
| `/videos` | 200 | 4 ms |

**Assessment:** All route navigations are effectively instant (< 10 ms).
React client-side routing introduces zero perceptible delay.

---

## 5) Full User Flow Test (interactive browser)

Tested the complete user journey with Playwright headless Chrome:

| Step | Result | Notes |
|------|--------|-------|
| Page load (login screen) | ✅ Pass | Renders in < 70 ms |
| Fill login form | ✅ Pass | Instant input response |
| Submit login | ✅ Pass | ~240 ms (bcrypt) |
| Post-login dashboard | ✅ Pass | "Willkommen bei Amy's Echo" + 2 action buttons |
| Navigate → Lernen | ✅ Pass | 12 signs loaded with categories |
| Navigate → Symbole | ✅ Pass | Metacom board with quick sentences |
| Navigate → Verlauf | ✅ Pass | Empty state message |
| Navigate → Einstellungen | ✅ Pass | Profile, password, account settings |
| Navigate → Kamera | ✅ Pass | Camera placeholder (no hardware) |
| Navigate → Übersicht | ✅ Pass | 4 hub links rendered |

**All German UI text uses "Gebärde" consistently.** No terminology violations found.

---

## 6) Observations and Findings

### Strengths
- **Sub-millisecond API responses** for most endpoints (profiles, symbols, labels).
- **Small bundle size** — 239 KB gzipped total is excellent for a React app.
- **Instant route transitions** — SPA navigation is imperceptible.
- **Clean error handling** — camera unavailability shows helpful German message.
- **Rich Metacom integration** — quick sentences, symbol board, sentence composer all functional.

### Issues Discovered

1. **No development CORS support** — The server had no CORS headers, preventing
   local webapp→API communication when running on different ports. Fixed in this
   PR by adding development-only CORS middleware (gated behind `NODE_ENV !== "production"`).

2. **Cached API URL persistence** — `localStorage` key `webapp:api-config` persists the
   API base URL across sessions. If a user switches between production and local dev,
   the stale cached URL causes "Failed to fetch" errors until manually cleared. This is
   by design for production (avoids recalculation) but can confuse developers.

3. **Model contract rejection** — The global model returns HTTP 200 but the client-side
   `isAcceptedModel` predicate rejects it (logged as "Modell-Antwort abgelehnt"). Falls
   back to "Standarderkennung aktiv" (MediaPipe default). This is expected behaviour for
   the zero-model but worth noting.

4. **Login latency (238 ms)** — Entirely due to bcrypt cost factor 12. This is the correct
   security trade-off. Not a performance issue.

### Recommendations

- **Run this benchmark on target devices** (Galaxy Tab A7 Lite, Moto G Power) using the
  device performance protocol to get real-world numbers with actual network latency,
  camera initialization, and MediaPipe WASM loading.
- **Consider pre-warming** the model endpoint on login to reduce time-to-first-recognition.
- **Add CORS configuration to development docs** so contributors know how to test locally.
