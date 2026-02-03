# Server Test Fix Summary

## Problem
Two integration tests were failing after the backward compatibility cleanup:

```
FAIL test/integration/stress.test.ts
FAIL test/integration/apiIntegration.test.ts

Error: Profile initialization failed: registry is empty and no database 
profiles were found to sync from (DB profiles: 0)
```

## Root Cause
The backward compatibility cleanup removed automatic default profile creation in `setupDatabase()`, but the server initialization code still had an invariant check that expected at least one profile to exist:

```typescript
// server/src/server.ts:358-363 (BEFORE)
if (profileRegistry.profiles.length === 0) {
    // Invariant violation: setupDatabase should have ensured at least one profile exists in the DB.
    throw new Error(
        `Profile initialization failed: registry is empty and no database profiles were found to sync from (DB profiles: ${db.profiles.length})`,
    );
}
```

This check was based on the old behavior where `setupDatabase()` would automatically create a default profile.

## Solution
Removed the outdated invariant check from `server/src/server.ts`:

```typescript
// server/src/server.ts:358 (AFTER)
// Zero profiles is acceptable at startup - profiles are created via user registration
```

The system now correctly handles starting with zero profiles, consistent with the new production-ready design where profiles are only created through explicit user registration.

## Test Results

**Before Fix:**
```
Test Suites: 2 failed, 25 passed, 27 total
Tests:       2 failed, 118 passed, 120 total
```

**After Fix:**
```
Test Suites: 27 passed, 27 total
Tests:       120 passed, 120 total
```

## Impact
✅ All server tests now pass
✅ Integration tests work correctly with zero initial profiles
✅ System can start cleanly without any pre-existing profiles
✅ Consistent with production-ready design (profiles via registration only)

## Related Changes
- Part of the backward compatibility cleanup PR
- Follows the removal of automatic profile creation in `setupDatabase()`
- Aligns with the Amy First principle of explicit user flows

## Verification
Run server tests:
```bash
cd server
npm run test:ts
```

Expected: All 120 tests pass across 27 test suites.
