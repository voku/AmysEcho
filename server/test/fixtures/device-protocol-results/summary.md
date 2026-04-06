# Device performance protocol summary

- Result directory: `server/test/fixtures/device-protocol-results`
- Gate mode: `main_thread`
- Fleet verdict: **GO**
- Rationale: All required P0 devices passed and no P1 device failed.

## Per-device metrics and gate verdicts

| Device | Tier | Mode | Cold start | Warm restart | Camera flip | Drop % | FPS p50 | FPS p95 | Memory growth | Battery drain | Thermal | G1 | G2 | G3 | G4 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Samsung Galaxy Tab A7 Lite | P0 | main_thread | 4200.0 | 1500.0 | 1550.0 | 12.0 | 16.0 | 9.0 | 35.0 | 8.0 | warm | Pass | Pass | Pass | Pass |
| Moto G Power (2023+) | P0 | main_thread | 4650.0 | 1730.0 | 1750.0 | 11.0 | 17.0 | 10.0 | 40.0 | 9.0 | warm | Pass | Pass | Pass | Pass |
| MacBook Air M1 | P1 | main_thread | 2050.0 | 580.0 | 650.0 | 3.0 | 28.0 | 18.0 | 18.0 | 4.0 | cool | Pass | Pass | Pass | Pass |
