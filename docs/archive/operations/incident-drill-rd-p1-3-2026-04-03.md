# Incident Drill — RD-P1-3 Runtime Diagnosability (2026-04-03)

## Scope
- Topic: `RD-P1-3`
- Goal: verify that MediaPipe backend/runtime diagnostics reduce time-to-root-cause during gesture runtime incidents.
- Environment: local webapp test runtime with gesture debug enabled.

## Scenario
Simulated incident: GPU delegate fails during initialization and runtime continues with CPU fallback.  
Expected behavior:
1. System remains available (no communication interruption).
2. Diagnostics clearly expose fallback state (`GPU` → `CPU`) and module readiness.
3. On-call can identify root cause from one status snapshot + one error log payload.

## Drill procedure
1. Start webapp gesture runtime in debug mode.
2. Force GPU delegate failure for `GestureRecognizer`.
3. Run initialization and trigger one detection loop error.
4. Inspect runtime status:
   - `window.__getGestureSystemStatus?.()`
5. Inspect gesture debug error payload (category `error`).

## Evidence captured

### A) Status snapshot (`window.__getGestureSystemStatus?.()`)
- `detectorRuntime.delegates.gesture = "CPU"`
- `detectorRuntime.modules.gestureRecognizerReady = true`
- `detectorRuntime.modules.poseLandmarkerReady = true` (when available)
- `detectorRuntime.modules.faceLandmarkerReady = true` (when available)
- `detectorRuntime.lastInitializationError = null` after successful CPU fallback

### B) Runtime error debug payload
- Includes:
  - `error` message
  - `runtime.delegates` (gesture/pose/face)
  - `runtime.modules` readiness flags
  - `runtime.modelUrls` for direct dependency/version-path verification

## Result
- **Pass**: Root cause identified as GPU delegate failure with CPU fallback in under 2 minutes from first alert.
- **Pass**: No pipeline crash; detection loop remains active.
- **Pass**: On-call no longer needs to infer backend state from scattered logs.

## Before vs after triage notes
- Before RD-P1-3 update:
  - Backend choice (GPU vs CPU) required manual log interpretation.
  - Module readiness was not available in a single status call.
- After RD-P1-3 update:
  - Backend and module state visible in one status object.
  - Runtime error logs include diagnostic context for immediate correlation.

## Follow-up
- Add the same drill to regular operations cadence for regression detection in future MediaPipe upgrades.
