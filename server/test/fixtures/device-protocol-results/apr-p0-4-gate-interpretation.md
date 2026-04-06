# APR-P0-4 Gate Interpretation Snapshot — device-protocol-results

## Purpose
Provide an interpreted APR-P0-4 gate verdict using the canonical G1-G4 mapping from `docs/testing/benchmarks/device-performance-protocol.md`.

## Input evidence used
- `server/test/fixtures/device-protocol-results/device_matrix.md`
- `server/test/fixtures/device-protocol-results/cold_start_results.csv`
- `server/test/fixtures/device-protocol-results/warm_restart_results.csv`
- `server/test/fixtures/device-protocol-results/camera_flip_results.csv`
- `server/test/fixtures/device-protocol-results/sustained_session_summary.csv`

## Per-device gate verdicts

| Device | Tier | G1 Startup | G2 Real-time loop | G3 Long-session stability | G4 Camera transition | Verdict basis |
|--------|------|------------|-------------------|---------------------------|----------------------|---------------|
| Samsung Galaxy Tab A7 Lite | P0 | Pass | Pass | Pass | Pass | All required thresholds passed in mode=main_thread |
| Moto G Power (2023+) | P0 | Pass | Pass | Pass | Pass | All required thresholds passed in mode=main_thread |
| MacBook Air M1 | P1 | Pass | Pass | Pass | Pass | All required thresholds passed in mode=main_thread |

## Fleet verdict
- **GO**
- **Rationale:** All required P0 devices passed and no P1 device failed.

## Remediation ownership
| Action | Owner | Target date |
|--------|-------|-------------|
| No remediation required | - | - |
