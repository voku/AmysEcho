# Security Fixes Implementation Guide

This document describes the security vulnerabilities that were fixed on 2026-02-02 and provides guidance for deployment.

## Critical Fixes Implemented

### 1. Profile Authorization Bypass (CRITICAL - FIXED)

**Vulnerability:** The system was using client-controlled HTTP headers (`x-profile-id`) to authorize profile access. Any authenticated user could access any profile by manipulating this header.

**Fix:** 
- Added `userId` field to the `Profile` type to establish ownership
- Rewrote `isProfileAuthorized()` to verify:
  1. User owns the profile (profile.userId === user.id)
  2. OR user is a caregiver with explicit access (from ProfileRegistry)
- Added comprehensive tests (12 test cases) to prevent regression

**Impact:** This was a complete authorization bypass. Any authenticated user could access training data, personal information, and ML models of ANY profile.

**Migration Required:** Yes - see "Database Migration" section below.

### 2. Missing User-Profile Ownership (HIGH - FIXED)

**Vulnerability:** Profiles had no explicit owner field. The system relied on an undocumented assumption that `userId === profileId`.

**Fix:**
- Added `userId: string` field to `Profile` interface
- Updated profile creation to automatically set `userId` from authenticated user
- Added migration logic to assign userId to existing profiles

**Migration Required:** Yes - see "Database Migration" section below.

### 3. Username/Email Uniqueness Not Enforced (HIGH - FIXED)

**Vulnerability:** Uniqueness checks were only in application code, creating potential race conditions.

**Fix:**
- Added explicit validation in `addUser()` function
- Throws error if duplicate username or email is detected
- Works with existing file lock for atomicity

**Impact:** Prevents duplicate accounts which could lead to authentication bypass.

### 4. Default Backup Secret (MEDIUM - FIXED)

**Vulnerability:** `BACKUP_SECRET` had a hardcoded default value of `"default-secret-password"`.

**Fix:**
- Removed default value - now required to be explicitly set
- Added validation warning for weak secrets (<16 characters)
- Updated documentation

**Impact:** Profile backups are now properly secured.

### 5. Workflow Security (MEDIUM - FIXED)

**Vulnerability:** API URL was hardcoded in GitHub Actions workflow file.

**Fix:**
- Changed to use GitHub repository secret `VITE_API_URL`
- Falls back to public demo URL if secret not set
- Added documentation about required secrets

## Database Migration

The security fixes require a database schema change. Existing deployments must run a migration.

### Automatic Migration

The migration runs automatically on server startup via `migrateProfileUserIds()` in `db.ts`:

1. Scans all profiles in the database
2. For each profile without a `userId`:
   - Tries to match with a user by ID (legacy userId === profileId pattern)
   - If no match, assigns `userId = "system"` for the default profile
3. Saves the migrated database

### Manual Migration (Optional)

If you want to manually assign profiles to users:

```typescript
// In server console or migration script:
import { loadDatabase, saveDatabase } from './db';

const db = await loadDatabase('./db.json');

// Assign specific profiles to users
for (const profile of db.profiles) {
  if (profile.displayName === 'Amy\'s Profile') {
    profile.userId = 'actual-user-id-here';
  }
}

await saveDatabase(db, './db.json');
```

### Verification

After migration, verify profiles have userId:

```bash
# Check database file
cat db.json | jq '.profiles[] | {id, userId, displayName}'
```

Expected output:
```json
{
  "id": "profile-123",
  "userId": "user-456",
  "displayName": "Profile Name"
}
```

## Deployment Checklist

Before deploying these security fixes to production:

### 1. Environment Variables

**REQUIRED** - Server will not start without these:

```bash
# Generate strong secrets (minimum 32 characters recommended)
export JWT_SECRET=$(openssl rand -base64 32)
export JWT_REFRESH_SECRET=$(openssl rand -base64 32)
export BACKUP_SECRET=$(openssl rand -base64 32)
```

### 2. GitHub Secrets

**RECOMMENDED** - For workflow security:

1. Go to Repository Settings → Secrets and variables → Actions
2. Add `VITE_API_URL` with your production API URL
3. This prevents exposing infrastructure details in public repos

### 3. Database Backup

**CRITICAL** - Backup before deployment:

```bash
# Backup existing database
cp db.json db.json.backup.$(date +%Y%m%d_%H%M%S)

# Backup profile registry
cp profile-registry.json profile-registry.json.backup.$(date +%Y%m%d_%H%M%S)
```

### 4. Testing

Run the security test suite:

```bash
cd server
npm test -- profileAuthorization.test.ts
```

All 12 tests must pass.

### 5. Deployment Steps

1. Stop the server
2. Backup database (see step 3)
3. Deploy new code
4. Set environment variables (see step 1)
5. Start server (migration runs automatically)
6. Verify logs show successful migration
7. Test authorization with real users

### 6. Verification

After deployment, verify the fixes:

```bash
# 1. Check server starts successfully
curl http://localhost:5000/health

# 2. Try to access a profile without proper authorization (should fail)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "x-profile-id: some-other-profile-id" \
     http://localhost:5000/api/v1/profiles/some-other-profile-id
# Expected: 403 Forbidden

# 3. Access your own profile (should succeed)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5000/api/v1/profiles/YOUR_PROFILE_ID
# Expected: 200 OK with profile data
```

## Breaking Changes

### API Changes

**Profile Creation API:**
- Now automatically sets `userId` from authenticated user
- Cannot create profiles for other users
- Admin/caregiver roles can still share access via ShareTokens

**Profile Authorization:**
- `x-profile-id` header is **no longer used** for authorization
- Authorization is based on:
  1. Profile ownership (userId in database)
  2. Caregiver access (ProfileRegistry permissions)

### Configuration Changes

**Required Environment Variables:**
- `BACKUP_SECRET` - No longer has a default value

**Recommended Environment Variables:**
- `VITE_API_URL` - Move to GitHub secret for workflow security

## Security Test Coverage

New test suite covers:
- ✅ Owner access to own profiles
- ✅ Owner access to multiple profiles
- ✅ Denial of access to other users' profiles
- ✅ Caregiver access with explicit permissions
- ✅ **Authorization bypass attempt via header spoofing**
- ✅ Access without authentication
- ✅ Access to non-existent profiles
- ✅ Edge cases (empty IDs, orphaned profiles, etc.)

## Rollback Plan

If issues occur after deployment:

1. Stop the server
2. Restore database backup:
   ```bash
   cp db.json.backup.TIMESTAMP db.json
   cp profile-registry.json.backup.TIMESTAMP profile-registry.json
   ```
3. Revert to previous code version
4. Start server

**Note:** Rolling back loses any new data created after deployment. Consider data export first.

## Future Security Enhancements

Recommended for future implementation:

1. **Database Migration:** Move from JSON file to SQLite/PostgreSQL with proper indexes
2. **Audit Logging:** Log all profile access attempts for security monitoring
3. **Rate Limiting:** Add per-user rate limiting for profile operations
4. **HTTPS Enforcement:** Require HTTPS in production mode
5. **HSTS Headers:** Add HTTP Strict Transport Security
6. **Session Management:** Implement refresh token rotation
7. **2FA Support:** Add two-factor authentication option

## Questions & Support

For questions about these security fixes:
1. Review the [Security Audit Report](./security-audit-2026-02-02.md)
2. Check test files for examples: `server/test/profileAuthorization.test.ts`
3. Review code changes in commit: `fa2c1ba`

## References

- [Security Audit Report](./security-audit-2026-02-02.md) - Full vulnerability details
- [CWE-639](https://cwe.mitre.org/data/definitions/639.html) - Authorization Bypass Through User-Controlled Key
- [CWE-284](https://cwe.mitre.org/data/definitions/284.html) - Improper Access Control
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
