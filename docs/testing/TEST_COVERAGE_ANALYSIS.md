# Test Coverage Analysis — v0.0.1

**Generated:** 2026-03-02T20:38:05Z  
**Release Gate:** v0.0.1  
**Status:** ✅ All gates passed

## Summary

| Component   | Test Files | Tests  | Result |
|-------------|-----------|--------|--------|
| Webapp      | 128       | 1 238  | ✅ Pass |
| Server (TS) | 42 suites | 272    | ✅ Pass |
| Server (Py) | —         | 113    | ✅ Pass |
| Integration | 1 suite   | 14     | ✅ Pass |

All 1 637 automated tests pass with zero failures and zero skips.

## Commands Run

```
npm run type-check --prefix webapp   → EXIT 0
npm run lint --prefix webapp         → EXIT 0
npm test --prefix webapp             → 128 files, 1238 tests PASS
npm run build --prefix webapp        → EXIT 0

npm run type-check --prefix server   → EXIT 0
npm run lint --prefix server         → EXIT 0
npm test --prefix server             → 42 suites (272 TS + 113 Py) PASS
npm run build --prefix server        → EXIT 0

npm test --prefix integration        → 14 tests PASS
```

## Webapp Build Output (vite v7.3.1)

```
dist/index.html                         1.97 kB │ gzip:   0.94 kB
dist/assets/index-HufQ2xEr.css         93.71 kB │ gzip:  14.76 kB
dist/assets/vendor-OthGmTVs.js         24.38 kB │ gzip:  10.86 kB
dist/assets/vendor-react-BWZsry-l.js  230.57 kB │ gzip:  73.86 kB
dist/assets/index-BVLmDvuQ.js         457.51 kB │ gzip: 131.80 kB
✓ built in 2.11s
```

## Risk Area Coverage

| Risk Area                                | Test Evidence                                      |
|------------------------------------------|----------------------------------------------------|
| Camera access / landmark capture         | `src/gesture/*.test.ts` (16 tests)                 |
| Training uploads (bundle creation/ingest)| `server/test/trainingBundles.test.ts`              |
| Model download and serving               | `server/test/latestMlpModelRoute.test.ts`          |
| Auth / session refresh                   | `server/test/authRoutes.test.ts`                   |
| Profile scope and identity               | `server/test/profileAuthorization.test.ts`         |
| End-to-end training loop                 | `integration/test/` (14 tests)                     |
| Health endpoint                          | `server/test/healthCheck.test.ts`                  |
| Security / HTTPS / rate-limiting         | `server/test/securityVulnerabilities.test.ts`      |
| Python training tools                    | `server/src/amyserver_tools/` pytest (113 tests)   |
| Metacom full-cycle                       | `integration/test/metacom-full-cycle.test.ts`      |

## Python Environment Requirement

Server Python tests require the following packages (installed via `pip install -r server/requirements.txt`):

- numpy, scikit-learn, scipy
- mediapipe, opencv-python
- librosa, soundfile

If these are absent, 19 server tests that exercise the Python training tools will fail. Install requirements before running `npm test --prefix server` in any new environment.

## Coverage Thresholds

Overall coverage is not enforced via a numeric threshold at this stage; instead, evidence-based coverage is documented above.  
Post-v0.0.1 priority: add `--coverage` thresholds (≥ 80 % overall, ≥ 90 % for critical modules) to CI.
