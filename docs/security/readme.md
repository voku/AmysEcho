# Security Documentation

This directory contains security-related documentation for the Amy's Echo project.

## Documents

### [governance-cadence.md](./governance-cadence.md)
**Security + Accessibility Governance Cadence**

Defines the operational quality gate for:
- monthly security verification with named owners,
- quarterly accessibility verification cadence with owners,
- standardized evidence templates for repeatable reporting.

### [security-audit-2026-02-02.md](./security-audit-2026-02-02.md)
**Comprehensive Security Audit Report**

Full audit findings including:
- 1 CRITICAL vulnerability (Authorization Bypass)
- 2 HIGH severity issues (Missing ownership, uniqueness enforcement)
- 2 MEDIUM severity issues (Default secrets, hardcoded URLs)
- Detailed impact analysis and recommendations
- Security best practices already implemented

**Key Finding:** The system had a critical authorization bypass where any authenticated user could access any profile by manipulating HTTP headers.

### [security-fixes-guide.md](./security-fixes-guide.md)
**Implementation & Deployment Guide**

Practical guide for deploying the security fixes:
- Step-by-step migration instructions
- Database schema changes (userId field added to Profile)
- Environment variable requirements
- Deployment checklist
- Verification procedures
- Rollback plan
- Breaking changes documentation

## Quick Summary

### Vulnerabilities Fixed

| Severity | Issue | Status |
|----------|-------|--------|
| CRITICAL | Profile Authorization Bypass via Header Spoofing | ✅ FIXED |
| HIGH | Missing User-Profile Ownership Relationship | ✅ FIXED |
| HIGH | Username/Email Uniqueness Not Enforced at DB Layer | ✅ FIXED |
| MEDIUM | Workflow Hardcoded API URL | ✅ FIXED |
| MEDIUM | Default Backup Secret | ✅ FIXED |

### Key Security Improvements

1. **Authorization Model Redesigned**
   - Added `userId` field to Profile type
   - Authorization now based on database ownership + caregiver registry
   - Header spoofing no longer possible
   - 12 comprehensive tests added

2. **Data Integrity Enhanced**
   - Username/email uniqueness enforced at data layer
   - Prevents duplicate accounts and auth bypass

3. **Configuration Hardened**
   - Removed all default secrets
   - Secrets must be explicitly configured
   - Weak secret detection added

4. **Infrastructure Security**
   - API URLs moved to GitHub secrets
   - Reduced information disclosure

### Security Test Suite

New test file: `server/test/profileAuthorization.test.ts`

**Coverage:**
- ✅ Owner access to own profiles (2 tests)
- ✅ Access denial to other users' profiles (1 test)
- ✅ Caregiver access with permissions (2 tests)
- ✅ Authorization bypass attempts (5 tests)
- ✅ Edge cases (2 tests)

**Total: 12 tests, all passing** ✅

### CodeQL Analysis

**Result:** 0 security alerts ✨

The code has been scanned with GitHub's CodeQL security analysis and found no vulnerabilities.

## For Developers

### Before Deployment

1. **Read** [security-fixes-guide.md](./security-fixes-guide.md) completely
2. **Backup** database and profile registry
3. **Set** required environment variables:
   ```bash
   export JWT_SECRET=$(openssl rand -base64 32)
   export JWT_REFRESH_SECRET=$(openssl rand -base64 32)
   export BACKUP_SECRET=$(openssl rand -base64 32)
   ```
4. **Run** security tests:
   ```bash
   cd server && npm test -- profileAuthorization.test.ts
   ```
5. **Deploy** and verify migration logs

### Security Testing

Run the security test suite:
```bash
cd server
npm test -- profileAuthorization.test.ts
```

All 12 tests must pass before deployment.

### Governance Evidence

- Monthly security records are stored in `docs/security/evidence/`.
- Quarterly accessibility cycle artifacts are stored in `docs/testing/`.

### Verification After Deployment

```bash
# 1. Verify server health
curl http://localhost:5000/health

# 2. Test authorization (should fail with 403)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "x-profile-id: OTHER_PROFILE_ID" \
     http://localhost:5000/api/v1/profiles/OTHER_PROFILE_ID

# 3. Test own profile access (should succeed)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5000/api/v1/profiles/YOUR_PROFILE_ID
```

## For Security Researchers

### Responsible Disclosure

If you discover a security vulnerability in Amy's Echo:

1. **Do NOT** open a public issue
2. **Email** security details to the maintainers
3. **Include**:
   - Vulnerability description
   - Steps to reproduce
   - Impact assessment
   - Suggested fix (optional)

### Scope

In-scope for security research:
- Authentication and authorization
- Data validation and injection attacks
- Session management
- API security
- Cryptographic implementations

Out-of-scope:
- Social engineering
- Physical security
- Denial of service
- Third-party dependencies (use npm audit)

## Security Posture

### ✅ Implemented Security Measures

- Bcrypt password hashing (12 rounds, OWASP compliant)
- JWT access tokens (15m expiration)
- JWT refresh tokens (7d expiration)
- Rate limiting on authentication endpoints
- Email verification flow
- Input validation using Zod schemas
- Atomic file writes with locking
- Path traversal prevention
- User enumeration prevention
- Secure UUID generation (crypto.randomUUID)
- **Profile ownership authorization**
- **Username/email uniqueness enforcement**
- **No default secrets**

### ⚠️ Recommended Enhancements

1. Migrate from JSON file to proper database (SQLite/PostgreSQL)
2. Add audit logging for security events
3. Implement HTTPS enforcement in production
4. Add HSTS security headers
5. Implement refresh token rotation
6. Add 2FA support for sensitive operations
7. Implement per-user rate limiting

### 📊 Security Metrics

- **Critical vulnerabilities:** 0 (was 1, now fixed)
- **High vulnerabilities:** 0 (was 2, now fixed)
- **Medium vulnerabilities:** 0 (was 2, now fixed)
- **CodeQL alerts:** 0
- **Security test coverage:** 12 tests, 100% pass rate

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [CWE-639: Authorization Bypass](https://cwe.mitre.org/data/definitions/639.html)
- [CWE-284: Improper Access Control](https://cwe.mitre.org/data/definitions/284.html)

## Version History

- **2026-02-02:** Initial security audit and fixes
  - Fixed critical authorization bypass
  - Added profile ownership model
  - Enforced data uniqueness
  - Hardened configuration
  - Added comprehensive tests

---

**Last Updated:** 2026-02-02  
**Security Status:** ✅ All identified vulnerabilities fixed  
**Test Coverage:** 12/12 passing (100%)  
**CodeQL Status:** 0 alerts
