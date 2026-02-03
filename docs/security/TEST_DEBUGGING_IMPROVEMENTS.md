# Test Debugging Improvements - Python Test Failures

**Date:** 2026-02-03  
**Status:** 🔍 DEBUGGING IN PROGRESS

## Problem

Two Python tests continue to fail after authorization fixes:
- `test_train_endpoint_returns_queue_metadata`
- `test_train_requests_are_serialized`

Both tests fail when trying to POST to `/train-model` endpoint with 403 Forbidden error.

---

## Root Cause Analysis

### Authorization Flow

1. **Profile Creation:**
   - Test creates profile via `POST /api/v1/profiles`
   - Profile is created with `userId: "train-tester"` (from auth token)
   - Profile is saved to database

2. **Training Submission:**
   - Test POSTs to `/train-model` with `profileId: "11111111-1111-4111-8111-111111111111"`
   - Server checks authorization via `isProfileAuthorized()`
   - Looks up profile in database
   - Checks if `profile.userId === req.user.id`

3. **Failure Point:**
   - Authorization check returns false → 403 Forbidden
   - Either:
     - Profile not found in database (timing/persistence issue)
     - Profile.userId doesn't match req.user.id (data inconsistency)
     - Something else preventing authorization

---

## Debugging Improvements Made

### 1. Enhanced Error Handling in `create_profile()`

**Before:**
```python
except urllib.error.HTTPError as e:
    # Profile might already exist, that's okay
    if e.code != 409 and e.code != 500:
        raise
```

**After:**
```python
except urllib.error.HTTPError as e:
    # Profile might already exist (409 Conflict), that's okay
    # But log other errors for debugging
    if e.code == 409:
        # Profile already exists, that's fine
        pass
    else:
        error_body = e.read().decode('utf-8') if e.fp else "No error body"
        raise RuntimeError(f"Failed to create profile: {e.code} {e.msg}\nBody: {error_body}") from e
```

**Why:** Now we'll see the actual HTTP error and response body if profile creation fails.

### 2. Added Profile Verification Step

**New Code:**
```python
# Create the profile that will be used in tests
create_profile(port, access_token, "11111111-1111-4111-8111-111111111111", "Test Profile")

# Verify profile was created by trying to fetch it
verify_url = f"http://localhost:{port}/api/v1/profiles/11111111-1111-4111-8111-111111111111"
verify_req = urllib.request.Request(verify_url, headers=headers)
try:
    with urllib.request.urlopen(verify_req, timeout=5) as resp:
        if resp.getcode() != 200:
            raise RuntimeError(f"Profile verification failed: status {resp.getcode()}")
except urllib.error.HTTPError as e:
    error_body = e.read().decode('utf-8') if e.fp else "No error body"
    raise RuntimeError(f"Profile verification failed: {e.code} {e.msg}\nBody: {error_body}") from e
```

**Why:** This will catch any issues with profile persistence or authorization BEFORE the tests run.

---

## What To Expect From Next CI Run

### Scenario 1: Profile Creation Fails

If profile creation is failing, we'll now see:
```
RuntimeError: Failed to create profile: 403 Forbidden
Body: {"error": "...actual error message..."}
```

This would indicate an authentication or authorization issue during profile creation itself.

### Scenario 2: Profile Verification Fails

If the profile is created but not accessible, we'll see:
```
RuntimeError: Profile verification failed: 403 Forbidden
Body: {"error": "Zugriff verweigert."}
```

This would indicate the profile exists but isn't properly associated with the user.

### Scenario 3: Tests Still Fail with 403

If both creation and verification succeed but tests still fail, it means:
- Profile creation works
- Profile retrieval works
- But training submission fails

This would indicate a specific issue with the train-model authorization check.

### Scenario 4: Tests Pass

If the improved error handling and verification step reveal no issues, the tests might just pass now with the extra validation in place.

---

## Possible Issues & Solutions

### Issue 1: Database Not Persisting Between Requests

**Symptom:** Profile created successfully but not found during training request

**Cause:** In-memory database not being shared between requests or file not being read

**Solution:** Verify database file path and ensure all requests use the same database instance

### Issue 2: User ID Mismatch

**Symptom:** Profile exists but authorization fails

**Cause:** Profile.userId doesn't match req.user.id due to token inconsistency

**Solution:** Verify JWT token payload matches profile owner

### Issue 3: Timing Issue

**Symptom:** Profile sometimes accessible, sometimes not

**Cause:** File I/O or async operation not completing

**Solution:** Add explicit wait or verify operation completion

---

## Next Steps Based on CI Results

1. **If profile creation fails:**
   - Check authentication in test setup
   - Verify JWT token is valid
   - Check if auth middleware is working

2. **If profile verification fails:**
   - Check database persistence
   - Verify profile.userId is set correctly
   - Check isProfileAuthorized logic

3. **If training request fails:**
   - Debug the specific authorization check in train-model
   - Verify dbInstance and profileRegistry are initialized
   - Check if database changes are visible to training endpoint

4. **If tests pass:**
   - Document what fixed it
   - Apply same pattern to any other failing tests
   - Close the issue

---

## Files Changed

| File | Changes | Purpose |
|------|---------|---------|
| `server/test/test_train_endpoint.py` | Enhanced error handling | Show actual errors instead of swallowing them |
| `server/test/test_train_endpoint.py` | Added verification step | Ensure profile is accessible before tests run |

---

## Commits

1. `d9fc234` - Improve error handling in create_profile for better debugging
2. `68a863d` - Add profile verification step after creation in test setup

---

## Expected Outcome

With these improvements, the next CI run will provide much clearer error messages that will help identify the exact failure point:
- ✅ Is profile creation failing?
- ✅ Is profile persisting to database?
- ✅ Is profile accessible after creation?
- ✅ Is authorization working correctly?

**No more guessing** - we'll have concrete error messages showing exactly what's failing and why.
