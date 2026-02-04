# CodeQL Configuration Resolution

**Date:** 2026-02-04  
**Issue:** CI Failure - Custom CodeQL workflow conflicting with default setup

## Problem

The custom CodeQL workflow (`.github/workflows/codeql.yml`) was failing with error:
```
CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled
```

## Root Cause

GitHub has two ways to enable CodeQL scanning:
1. **Default Setup** (repository setting) - Automatic, managed by GitHub
2. **Advanced Setup** (custom workflow) - Manual configuration via workflow file

These two approaches **cannot coexist**. When default setup is enabled at the repository level, GitHub blocks custom workflows to prevent conflicts.

## Resolution

**Removed custom CodeQL workflow** and rely on GitHub's default setup.

### Why This Decision?

**Advantages of Default Setup:**
- ✅ Zero maintenance - GitHub manages updates automatically
- ✅ No workflow file to maintain or debug
- ✅ Still includes security-extended queries
- ✅ Automatic scanning on push and PRs
- ✅ Results in Security → Code scanning tab
- ✅ No CI failures from configuration conflicts

**Trade-offs Accepted:**
- ⚠️ Less control over Python version (GitHub chooses)
- ⚠️ Less control over scan schedule (GitHub's default)
- ⚠️ Cannot use custom query suites beyond security-extended

**Why Not Disable Default Setup?**
- Would require repository admin access (can't be done via code)
- Default setup provides sufficient coverage for our needs
- Simpler is better - aligns with Amy First principle

## Current State

### Active: GitHub Default CodeQL Setup
- **Location**: Repository Settings → Code security and analysis
- **Languages**: JavaScript, Python
- **Queries**: Security-extended (default)
- **Scan Trigger**: Automatic on push and PR
- **Results**: Security → Code scanning tab

### Removed: Custom Workflow
- **File**: `.github/workflows/codeql.yml` (deleted)
- **Reason**: Conflicted with default setup
- **Date Removed**: 2026-02-04

## Future Changes

If custom CodeQL configuration becomes necessary (e.g., specific Python version, custom queries):

1. **Disable default setup** (requires repository admin):
   - Go to Settings → Code security and analysis
   - Under "Code scanning", click "Set up" → Disable

2. **Create custom workflow**:
   - Add `.github/workflows/codeql.yml`
   - Configure languages, versions, queries as needed
   - Test thoroughly before merging

3. **Document rationale** in ADR-010

## Documentation Updates

Updated documentation to reflect this change:
- ✅ `docs/planning/TODO.md` - Marked CodeQL workflow as removed
- ✅ `docs/architecture/ADR.md` - Updated ADR-010 with conflict resolution
- ✅ `CODEQL_CONFIGURATION.md` - This file (new)

## Security Coverage

### Still Active
- ✅ GitHub default CodeQL scanning (JavaScript, Python)
- ✅ npm audit in CI (dependency vulnerabilities)
- ✅ Security test suite in CI
- ✅ All security monitoring continues

### Not Impacted
- This change only affects **how** CodeQL runs (default vs custom)
- Security coverage level remains the same
- All vulnerability detection continues working

## Verification

To verify CodeQL is working:
1. Go to repository on GitHub
2. Click "Security" tab → "Code scanning"
3. Should see CodeQL alerts (if any) or "No alerts"
4. Should see scan history with dates

## References

- [GitHub CodeQL Documentation](https://docs.github.com/en/code-security/code-scanning/automatically-scanning-your-code-for-vulnerabilities-and-errors/configuring-code-scanning)
- [Default vs Advanced Setup](https://docs.github.com/en/code-security/code-scanning/automatically-scanning-your-code-for-vulnerabilities-and-errors/configuring-default-setup-for-code-scanning)
- Issue: PR #920 - CI failure on CodeQL workflow
- ADR-010: CodeQL for Static Security Analysis

---

**Status:** ✅ Resolved - Using default CodeQL setup  
**Security Impact:** None - Coverage maintained  
**Maintenance Impact:** Reduced - One less workflow to maintain
