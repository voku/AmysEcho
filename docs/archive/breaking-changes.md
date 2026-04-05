# Breaking Changes - Pre-Launch Cleanup

This document describes the breaking changes made to remove backward compatibility code before the application goes live with kids.

## Version: Pre-Launch Cleanup (2026-02)

### Overview

These breaking changes remove technical debt and backward compatibility layers that were added during development. Since the application is not yet live with kids, we can safely introduce these changes now.

## Breaking Changes

### 1. API Routes Versioned to `/api/v1`

**What Changed:**
- All API routes now use the `/api/v1` prefix for versioning
- Old unversioned routes have been removed

**Migration:**

| Old Route | New Route |
|-----------|-----------|
| `/latest-mlp-model` | `/api/v1/models/latest` |
| `/model-version` | `/api/v1/models/version` |
| `/model-metadata` | `/api/v1/models/metadata` |
| `/api/config/normalization` | `/api/v1/config/normalization` |

**Action Required:**
- Update all API clients to use the new versioned endpoints
- Update environment variables that reference model endpoints
- Check any documentation or configuration that mentions the old routes

**Example:**
```typescript
// Before
const modelUrl = `${apiBase}/latest-mlp-model`;

// After  
const modelUrl = `${apiBase}/api/v1/models/latest`;
```

### 2. Profile Authorization Model Changed

**What Changed:**
- Removed `X-Profile-Id` header-based authorization (insecure, client-controlled)
- Profile access now requires database-backed verification
- Authorization checks user ownership or caregiver relationship from database

**Migration:**
- All profile operations now require proper user authentication via JWT
- The `X-Profile-Id` header is no longer used or accepted
- Profile access is verified against the database `profiles` table and `ProfileRegistry`

**Action Required:**
- Ensure all users are properly registered before accessing profiles
- Remove any code that sets the `X-Profile-Id` header
- Verify that profile operations use proper JWT authentication

**Security Impact:**
- ✅ **IMPROVED**: Previous header-based auth could be spoofed by clients
- ✅ **IMPROVED**: Database verification ensures only authorized users can access profiles

### 3. Window Globals Removed

**What Changed:**
- Removed window global fallbacks used for configuration:
  - `window.__facingMode` - camera facing mode
  - `window.__requestClipAudio` - audio capture flag
  - `window.__fallbackThreshold` - gesture confidence threshold

**Migration:**
- All camera configuration now persists via `localStorage` only
- Camera facing mode stored in `localStorage.cameraFacingMode`
- No window global overrides supported

**Action Required:**
- Remove any code that writes to these window globals
- Use `localStorage` for persistent camera configuration
- Update tests that relied on window global overrides

**Example:**
```typescript
// Before
window.__facingMode = 'environment';

// After
localStorage.setItem('cameraFacingMode', 'environment');
```

### 4. Deprecated Type Fields Removed

**What Changed:**
- Removed `enableRemoteClassification` from `MLServiceConfig` interface
- This field was marked deprecated and was not being used

**Migration:**
- Remove any references to `enableRemoteClassification` in configuration

### 5. Profile Migration and Auto-Creation Removed

**What Changed:**
- Removed `migrateProfileUserIds()` function
- Removed automatic default profile creation in `setupDatabase()`
- Profiles are now only created via explicit user registration

**Migration:**
- No automatic profile migration on database load
- Usage stats are only seeded when profiles already exist
- All profiles must be created through the registration flow

**Action Required:**
- Ensure user registration flow is working correctly
- Verify that profile creation happens explicitly
- Test that the application works without a default profile

**Database Impact:**
- Fresh databases will not have a default profile
- Existing databases will not have profiles migrated
- This is intentional for production readiness

### 6. Trained Labels Endpoint Uses Canonical Manifest Entries Only

**What Changed:**
- Removed the prelaunch fallback that merged labels from legacy sample-count storage.
- `/api/v1/dgs/trained-labels` now resolves labels from canonical `training_manifest.json` entries for the active profile.

**Migration:**
- Ensure training bundles are ingested through `/api/v1/dgs/sample-bundles` so labels appear in trained-label responses.
- Do not depend on `data/dgs_samples.json` for trained-label discovery.

**Action Required:**
- Update internal tooling/tests that still expected legacy sample-count fallback behavior.

### 7. Runtime Frame-Batch Payload Contract Centralized

**What Changed:**
- The frame-batch payload contract is now centralized in `webapp/src/types/frames.ts` and reused by training recorder logic.
- Contract includes optional multimodal fields (`poseLandmarks`, `faceLandmarks`) to match current runtime payload shape.

**Action Required:**
- Import `FrameBatchPayload` from `webapp/src/types/frames.ts` instead of duplicating local payload interfaces.

## Deployment

### Re-initialization Script

A deployment script has been created to handle these breaking changes:

```bash
sudo /opt/amysecho/app/deployment/scripts/re-init-after-breaking-changes.sh
```

This script will:
1. Stop the service
2. Create a backup of the data directory
3. Update dependencies
4. Rebuild the application
5. Restart the service
6. Perform health checks

### Environment Variables

No new environment variables are required, but you may need to update:
- `API_BASE_URL` - if hardcoded routes were used
- Any client configuration that references the old API routes

### Rollback

If you need to rollback:
1. Restore from the backup created by the re-init script
2. Checkout the previous git commit
3. Run the standard update script

```bash
# Restore backup
sudo tar -xzf /var/backups/amysecho/pre-reinit-YYYYMMDD-HHMMSS.tar.gz -C /opt/amysecho/

# Checkout previous version
cd /opt/amysecho/app
sudo -u amysecho git checkout <previous-commit>

# Update
sudo ./deployment/scripts/update-server.sh
```

## Testing

After deployment, verify:

- [ ] Health endpoint responds: `GET /health`
- [ ] Model endpoint works: `GET /api/v1/models/latest` (with auth)
- [ ] Profile authorization blocks unauthorized access
- [ ] Camera settings persist via localStorage
- [ ] User registration creates profiles correctly
- [ ] No automatic default profile is created

## Impact Assessment

### User Impact
- **NONE** - Application is not yet live with users
- All changes are internal/technical

### Developer Impact
- **MEDIUM** - API endpoints changed, requires code updates
- **LOW** - Better security model and cleaner codebase

### Data Impact
- **LOW** - No data migration required
- **LOW** - Existing profiles remain intact
- **LOW** - New installations won't have default profiles (expected)

## Questions?

If you have questions about these changes, please refer to:
- `deployment/scripts/re-init-after-breaking-changes.sh` - Deployment script
- `server/src/utils/profileAuthorization.ts` - New authorization model
- `webapp/src/gesture/core/CameraManager.ts` - New camera configuration

## Validation Checklist

After applying these changes, verify:

1. **Server Tests**: `npm test --prefix server` - All tests pass
2. **Webapp Tests**: `npm test --prefix webapp` - All tests pass  
3. **Type Checking**: No TypeScript errors
4. **API Endpoints**: All routes use `/api/v1` prefix
5. **Authorization**: Profile access requires proper authentication
6. **Configuration**: No window global fallbacks exist
7. **Documentation**: All references updated to new endpoints

## Post-Deployment Monitoring

Monitor these metrics after deployment:
- Health endpoint response time
- Authentication failure rates
- Profile access patterns
- API 404 errors (would indicate old endpoint usage)

## Conclusion

These breaking changes improve the application's:
- **Security**: Database-backed profile authorization
- **Maintainability**: Removed technical debt and backward compatibility code
- **API Design**: Proper versioning for future changes
- **Configuration**: Single source of truth (localStorage) instead of multiple mechanisms

The application is now ready for production deployment with kids.
