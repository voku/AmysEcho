# Blind Spot Analysis: Per-Profile Label Training Feature

This document captures a self-analysis of potential issues that may have been overlooked during the implementation of the per-user label training feature.

## Security Issues - Addressed

| Issue | Status | Solution |
|-------|--------|----------|
| Path traversal in trainingOrchestrator.ts | ✅ Fixed | Added `!entry.includes("..")` check |
| Path traversal in profileLabelSettingsService.ts | ✅ Fixed | Added `getSafeProfileTrainingDir()` with containment check |
| Unknown label validation in PATCH | ✅ Fixed | Check against baseline labels before update |
| Case sensitivity inconsistency | ✅ Fixed | Normalize labelId to lowercase in routes |

## Performance & Code Quality Issues - Addressed

| Issue | Status | Solution |
|-------|--------|----------|
| TOCTOU race condition in job queueing | ✅ Fixed | Added `jobCreationLock` Set to prevent concurrent job creation |
| DRY violation in modelPaths.ts | ✅ Fixed | Refactored `getUserLabelTrainingPath` to reuse `getUserTrainingDir` |
| O(N*M) lookup in profileLabelRoutes.ts | ✅ Fixed | Using Map for O(1) lookups in settings merge |
| Sequential awaits in getLabelReadinessForUser | ✅ Fixed | Using `Promise.all` for parallel processing |

## Potential Remaining Issues

### A. In-Memory Job Queue (trainingOrchestrator.ts)

**Issue**: The `jobQueue` is an in-memory `Map` - all job status is lost on server restart.

**Impact**: 
- Users see stale "running" jobs after server restart
- No recovery mechanism for interrupted long-running training
- Job history is lost

**Recommendation**: Persist job status to SQLite database with a `trainingJobs` table.

```sql
CREATE TABLE trainingJobs (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  status TEXT NOT NULL,
  startedAt TEXT,
  completedAt TEXT,
  error TEXT,
  labels TEXT, -- JSON
  metrics TEXT -- JSON
);
```

### B. No Pagination for Label Lists

**Issue**: `getLabelReadinessForUser()` returns all labels without pagination.

**Impact**: 
- Performance degradation with many labels
- Memory pressure on server
- Slow API responses

**Recommendation**: Add `page` and `pageSize` parameters.

### C. Orphaned Settings on Label Deletion

**Issue**: When a baseline label is removed, settings for that label remain in the database.

**Impact**: 
- Stale data accumulates
- Potential confusion in reports/analytics

**Recommendation**: 
- Add background cleanup job
- Or add ON DELETE CASCADE constraint

### D. Error Messages May Leak Details

**Issue**: Some error handlers pass through the original exception message.

```typescript
const message = error instanceof Error ? error.message : String(error);
logError("Failed to update label setting", { userId, labelId, error: message });
```

**Impact**: Internal paths or stack traces could leak to logs or responses.

**Recommendation**: Sanitize error messages before logging/responding.

## Test Coverage Gaps

### Missing Test Cases

1. **Path traversal attack scenarios** - Test with `../../../etc/passwd` in labelId
2. ~~**Concurrent job submission** - Test race condition scenarios~~ ✅ Fixed with locking
3. **Large dataset performance** - Test with 1000+ labels
4. **Server restart recovery** - Test job state after restart
5. **Invalid UTF-8 in labelId** - Test with malformed strings
6. **Rate limiting verification** - Test that limits are enforced

### Recommended Tests to Add

```typescript
describe("Security", () => {
  it("should reject path traversal in labelId", async () => {
    const response = await request(app)
      .get(`/api/v1/profiles/${testProfileId}/labels/..%2F..%2Fetc%2Fpasswd`)
      .expect(400);
    expect(response.body.error).toBe("Ungültige Label-ID.");
  });
});
```

## Documentation Gaps

| Gap | Priority | Recommendation |
|-----|----------|----------------|
| No OpenAPI/Swagger docs | Medium | Add openapi.yaml for new endpoints |
| No database migration strategy | High | Document schema changes |
| Missing error code documentation | Low | Add error codes enum |

## Priority Recommendations

### HIGH Priority
1. Persist job queue to database (in-memory queue loses data on restart)
2. Add database migration documentation

### MEDIUM Priority
1. Add pagination to label list endpoint
2. Add OpenAPI documentation
3. Add security-focused tests

### LOW Priority
1. Add cleanup for orphaned settings
2. Add error code documentation
3. Add performance tests

## Recently Addressed Issues

The following issues from code review have been addressed:

1. ✅ **TOCTOU Race Condition** - Added `jobCreationLock` Set to prevent concurrent job creation
2. ✅ **DRY Violation** - Refactored `getUserLabelTrainingPath` to reuse `getUserTrainingDir`
3. ✅ **O(N*M) Performance** - Using Map for O(1) lookups in settings merge
4. ✅ **Sequential Awaits** - Using `Promise.all` for parallel label readiness processing

---

*Last updated: 2026-02-05*
*Related PR: #930 Add per-user label training modes*
