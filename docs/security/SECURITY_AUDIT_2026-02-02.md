# Security Audit Report - Amy's Echo
**Date:** 2026-02-02  
**Scope:** Multi-Profile System, User Authentication, GitHub Workflows

## Executive Summary

This security audit identified **1 critical**, **2 high**, **2 medium**, and **2 low** severity security vulnerabilities in the Amy's Echo codebase. The most critical issue is a **profile authorization bypass** that allows any authenticated user to access any profile by manipulating HTTP headers.

## Critical Vulnerabilities

### 1. Profile Authorization Bypass via Header Spoofing (CRITICAL)

**Severity:** CRITICAL  
**CVSS Score:** 8.1 (High)  
**CWE:** CWE-639: Authorization Bypass Through User-Controlled Key

**Location:** `server/src/utils/profileAuthorization.ts`

**Description:**
The `isProfileAuthorized()` function only checks if the client-provided `x-profile-id` header matches the requested `profileId`. There is no verification that the authenticated user owns the profile.

```typescript
export function isProfileAuthorized(req: Request, profileId: string): boolean {
  const claimed = req.header("x-profile-id");
  // ... validation ...
  return normalized === profileId.trim();
}
```

**Impact:**
- Any authenticated user can access ANY profile by setting the `x-profile-id` header
- Complete bypass of profile-level authorization
- Unauthorized access to:
  - Profile data (name, age, metadata)
  - Training data and gesture recordings
  - Usage statistics and learning analytics
  - Vocabulary sets and symbols
  - Personal ML models

**Attack Scenario:**
```bash
# Attacker discovers profile IDs (via enumeration or legitimate access)
# Then accesses victim's profile by setting the header:
curl -H "Authorization: Bearer <attacker-token>" \
     -H "x-profile-id: <victim-profile-id>" \
     https://api.example.com/api/v1/profiles/victim-profile-id
```

**Recommendation:**
1. Add `userId` field to `Profile` type to establish ownership
2. Verify profile ownership in middleware:
   ```typescript
   export function isProfileAuthorized(req: Request, profileId: string): boolean {
     const profile = getProfileById(db, profileId);
     if (!profile) return false;
     
     // Check if user owns profile OR is a caregiver with access
     if (profile.userId === req.user?.id) return true;
     
     // Check caregiver access in registry
     const record = findProfileRecord(registry, profileId);
     return record?.caregivers.some(c => c.caregiverId === req.user?.id) ?? false;
   }
   ```

## High Severity Vulnerabilities

### 2. Missing User-Profile Ownership Relationship (HIGH)

**Severity:** HIGH  
**CVSS Score:** 7.5  
**CWE:** CWE-284: Improper Access Control

**Location:** 
- `server/src/types.ts` (Profile interface)
- `server/src/db.ts` (database schema)

**Description:**
The `Profile` type has no `userId` field to link profiles to their owners. The system relies on an implicit assumption that `userId === profileId` (see comment in `registration.ts` line 73), but this is not enforced in the type system or database.

```typescript
export interface Profile {
  id: string;
  displayName: string;
  createdAt: string;
  metadata?: ProfileMetadata;
  consentDataUpload: boolean;
  consentHelpMeGetSmarter: boolean;
  vocabularySetId: string;
  largeText?: boolean;
  highContrast?: boolean;
  // MISSING: userId field
}
```

**Impact:**
- No type-safe way to verify profile ownership
- Profiles created via `/api/v1/profiles` POST have no automatic owner assignment
- Makes it impossible to implement proper multi-profile support per user
- Authorization logic cannot reliably verify ownership

**Current Workaround:**
The code comment suggests `userId` is used as `profileId`, but this is fragile and not enforced.

**Recommendation:**
1. Add `userId: string` field to `Profile` interface
2. Update all profile creation code to set `userId`
3. Add migration to assign existing profiles to users
4. Validate `userId` matches authenticated user in all profile operations

### 3. Username/Email Uniqueness Not Enforced at Database Layer (HIGH)

**Severity:** HIGH  
**CVSS Score:** 7.0  
**CWE:** CWE-362: Concurrent Execution using Shared Resource with Improper Synchronization

**Location:** `server/src/db.ts`, `server/src/routes/auth/handlers/registration.ts`

**Description:**
The database is an in-memory JSON file with no unique constraints. Uniqueness checks happen in application code within a file lock:

```typescript
const result = await deps.withFileLock(deps.dbFilePath, async () => {
  const existingUsername = findUserByUsername(deps.db, username);
  const existingEmail = findUserByEmail(deps.db, email);
  
  if (existingUsername || existingEmail) {
    return { error: "..." };
  }
  // ... create user ...
});
```

**Impact:**
- Race condition possible if lock implementation fails
- Duplicate usernames/emails could be created
- Authentication bypass if multiple accounts share credentials
- Data corruption in user lookup operations

**Recommendation:**
1. Add explicit uniqueness validation in `addUser()` function
2. Consider migrating to a proper database (SQLite minimum) with unique indexes
3. Add integration tests for concurrent registration attempts
4. Document that JSON file database is NOT suitable for production

## Medium Severity Vulnerabilities

### 4. Workflow Hardcoded API URL (MEDIUM)

**Severity:** MEDIUM  
**CVSS Score:** 5.3  
**CWE:** CWE-798: Use of Hard-coded Credentials (related to hardcoded sensitive data)

**Location:** `.github/workflows/deploy-webapp.yml` line 34

**Description:**
The production API URL is hardcoded directly in the workflow file:

```yaml
env:
  VITE_BASE_PATH: /AmysEcho/
  VITE_API_URL: https://amysecho.moelleken.org
```

**Impact:**
- API URL exposed in public repository
- Potential information disclosure about infrastructure
- If API URL changes, requires code change instead of configuration update
- Could enable reconnaissance for targeted attacks

**Recommendation:**
1. Move `VITE_API_URL` to GitHub repository secrets
2. Reference as `${{ secrets.VITE_API_URL }}`
3. Document required secrets in deployment documentation
4. Consider using environment-based configuration

### 5. Default Backup Secret (MEDIUM)

**Severity:** MEDIUM  
**CVSS Score:** 5.0  
**CWE:** CWE-798: Use of Hard-coded Credentials

**Location:** `server/src/config/index.ts`

**Description:**
The `BACKUP_SECRET` has a weak default value:

```typescript
backupSecret: process.env.BACKUP_SECRET || "default-secret-password"
```

**Impact:**
- Profile backups may be encrypted with known default password
- Attacker with backup file access can decrypt data
- Affects all backups if secret is not explicitly configured

**Recommendation:**
1. Remove default value - require explicit configuration
2. Add validation to reject weak secrets
3. Log warning if BACKUP_SECRET is not set
4. Document required minimum entropy for the secret

## Low Severity Issues

### 6. Missing HTTPS Enforcement (LOW)

**Severity:** LOW  
**CWE:** CWE-319: Cleartext Transmission of Sensitive Information

**Location:** Server configuration

**Description:**
No explicit HTTPS requirement or enforcement in configuration.

**Recommendation:**
- Document HTTPS requirement for production
- Add middleware to reject non-HTTPS requests in production mode
- Configure HSTS headers

### 7. Rate Limiter Implementation Not Reviewed (LOW)

**Severity:** LOW  
**CWE:** CWE-307: Improper Restriction of Excessive Authentication Attempts

**Description:**
Rate limiters are implemented but likely use default IP-based limiting.

**Recommendation:**
- Review rate limiter configuration for production settings
- Consider user-based rate limiting for authenticated endpoints
- Add monitoring for rate limit violations

## Security Best Practices Identified

✅ **Good practices already implemented:**
- Bcrypt password hashing with 12 rounds (OWASP compliant)
- JWT tokens with reasonable expiration (15m access, 7d refresh)
- Email verification flow
- Rate limiting on authentication endpoints
- Input validation using Zod schemas
- Atomic file writes with locking
- Path traversal validation in archive restoration
- User enumeration prevention in registration error messages
- Secure UUID generation using crypto.randomUUID()

## Remediation Priority

1. **IMMEDIATE (Critical):**
   - Fix profile authorization bypass (#1)
   - Add userId to Profile type (#2)

2. **HIGH (Within 1 week):**
   - Enforce username/email uniqueness properly (#3)
   - Move API URL to secrets (#4)

3. **MEDIUM (Within 2 weeks):**
   - Remove default BACKUP_SECRET (#5)

4. **LOW (When convenient):**
   - Document HTTPS requirement (#6)
   - Review rate limiter configuration (#7)

## Testing Recommendations

1. Add security-focused integration tests:
   - Profile authorization bypass attempts
   - Concurrent registration race conditions
   - Profile ownership validation

2. Add penetration testing scenarios:
   - Horizontal privilege escalation attempts
   - Profile enumeration attacks
   - Token manipulation tests

3. Security scanning:
   - Run CodeQL analysis
   - Dependency vulnerability scanning
   - SAST/DAST testing before production

## Compliance Notes

For a production system handling children's data, consider:
- GDPR compliance requirements (EU users)
- COPPA compliance (US children's data)
- Data retention policies
- Right to deletion implementation
- Audit logging for data access

## Conclusion

The Amy's Echo system has a solid security foundation with proper authentication, password hashing, and rate limiting. However, the **critical profile authorization bypass** must be fixed immediately before any production deployment. The missing user-profile ownership relationship is the root cause and should be addressed as part of the same fix.

---

**Auditor Notes:**
- This audit focused on authentication and authorization logic
- Database security and infrastructure hardening were not in scope
- Client-side security (XSS, CSP) was not reviewed
- No dynamic testing or penetration testing was performed
