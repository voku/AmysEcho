# Amy First: How Infrastructure Work Supports Communication

## Purpose

This document explains how infrastructure, security, and platform-level work
directly supports Amy's ability to communicate.  Every change, no matter how
"technical", should trace back to one of the Amy First commitments.

## Mapping Infrastructure to Amy First Principles

### Zero Interruption
| Infrastructure Work | Amy Impact |
|---|---|
| Health check endpoint with degraded-status reporting | Monitoring detects partial failures before Amy's communication is affected |
| Python dependency cache (5-min TTL) | Health checks complete faster → more CPU cycles available for gesture recognition |
| Graceful shutdown handling | Active sign-language sessions are not interrupted during deploys |
| Profile backup/restore automation | Amy's personalized model survives hardware changes |

### Zero Delay
| Infrastructure Work | Amy Impact |
|---|---|
| Per-profile model distribution (`?profileId=`) | Amy gets her personalized model without extra round-trips |
| Metacom bundle server-side sync | Symbols load instantly on any device without re-importing |
| Training bundle upload with retry | Spotty Wi-Fi doesn't block learning new gestures |
| HTTP response caching headers | Repeat requests for models are served from the browser cache |

### Zero Failure
| Infrastructure Work | Amy Impact |
|---|---|
| HTTPS enforcement + HSTS | Data in transit is protected; no man-in-the-middle can tamper with models |
| Refresh-token rotation | Session hijacking is prevented so Amy's profile stays secure |
| Per-user rate limiting | Abusive traffic can't overwhelm the server during Amy's sessions |
| Audit logging | Anomalies are detected before they escalate to user-visible failures |
| Dependency vulnerability scanning | Supply-chain attacks are caught early |
| JSON file database with atomic writes | Amy's training samples won't be corrupted by concurrent writes |

### Zero Confusion
| Infrastructure Work | Amy Impact |
|---|---|
| German-first error messages | Amy and her caregivers see messages in their language |
| Metacom symbol mapping layer | Recognized gestures always show the correct Metacom symbol |
| Sentence composer | Amy builds multi-word utterances visually before speaking them |
| Structured health-check responses | Caregivers see clear system status, not cryptic errors |

### Zero Judgment
| Infrastructure Work | Amy Impact |
|---|---|
| Training quality gates with quality scores | Caregivers see "quality 85 %" instead of "bad recording" |
| Sign readiness percentage | Progress is celebrated, not measured against a pass/fail bar |
| Variation learning metadata | Natural signing differences are learned, not rejected |

### Zero Compromise
| Infrastructure Work | Amy Impact |
|---|---|
| GDPR profile export with all data | Amy's communication history belongs to her family |
| Profile deletion cascade | Removing a profile truly removes every associated file |
| Metacom licensing validation policy | Only legally safe symbols are distributed |

## Memory Profiling: Health Check Cache

The Python dependency cache (`pythonDepsCheckCache`) stores exactly one object:

```typescript
{
  status: "ok" | "error",   // ~5 bytes
  message: string,           // ~80 bytes typical
  timestamp: number          // 8 bytes
}
```

**Estimated overhead: < 200 bytes.**  This is negligible compared to the
benefits:

- Before cache: every `/health` request spawns a Python process (~10-50 ms,
  ~20 MB RSS per invocation).
- After cache: one cached object avoids thousands of process spawns per hour.

The trade-off is clear: 200 bytes of memory saves megabytes of transient
process overhead and hundreds of milliseconds per health check.  No further
profiling is needed for this component.

## Conclusion

Infrastructure work is not "tech debt" – it is the foundation that keeps Amy's
communication reliable, fast, and safe.  Every security patch, every caching
layer, and every monitoring endpoint exists so that Amy can focus on what
matters: expressing herself.
