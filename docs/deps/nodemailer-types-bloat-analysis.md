# @types/nodemailer AWS SDK Bloat Analysis

**Date:** 2026-02-04  
**Status:** 🟡 DOCUMENTED (Decision Pending)

## Issue Summary

The `@types/nodemailer` package brings in AWS SDK v3 dependencies (~11MB) as peer dependencies, even though Amy's Echo only uses basic SMTP and sendmail functionality. This adds significant bloat to the `node_modules` directory and increases installation time.

## Current State

### Package Sizes
- `@types/nodemailer`: 252KB
- `@aws-sdk/*`: 9.8MB (27 packages)
- `@aws-crypto/*`: 1.3MB
- **Total AWS-related bloat: ~11.1MB**

### Actual Usage in Amy's Echo

The codebase uses nodemailer for two simple operations:
1. Send verification emails (SMTP or sendmail)
2. Send password reset emails (SMTP or sendmail)

**Code location:** `server/src/services/emailService.ts`

**Features used:**
- `nodemailer.createTransport()` with SMTP config
- `nodemailer.createTransport()` with sendmail config  
- `transporter.sendMail()` with basic options (from, to, subject, text)

**AWS features used:** **NONE**

The AWS SDK dependencies come from `@types/nodemailer` attempting to provide TypeScript types for nodemailer's optional AWS SES transport, which Amy's Echo doesn't use.

## Impact Analysis

### Current Impact
- ✅ **No runtime impact**: AWS SDK is only in devDependencies, not production bundle
- ⚠️ **Development overhead**: 11MB extra in node_modules
- ⚠️ **CI/CD overhead**: Longer `npm ci` times in GitHub Actions
- ⚠️ **Developer experience**: Slower initial setup for contributors

### Potential Solutions

#### Option 1: Create Minimal Type Definitions (Recommended)
**Approach:** Create a local `emailService.d.ts` with only the types we need

**Pros:**
- Zero external dependencies for types
- Types tailored exactly to our usage
- Full control over type definitions
- No AWS bloat

**Cons:**
- Manual maintenance if nodemailer API changes
- Need to keep types in sync with nodemailer runtime
- Less complete than official types

**Effort:** ~30 minutes initial, ~5 minutes per nodemailer upgrade

**Example implementation:**
```typescript
// server/src/types/nodemailer.d.ts
declare module 'nodemailer' {
  export interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
    sendmail?: boolean;
    newline?: 'unix' | 'windows';
    path?: string;
  }
  
  export interface Transporter {
    sendMail(options: {
      from: string;
      to: string;
      subject: string;
      text: string;
    }): Promise<void>;
  }
  
  export function createTransport(options: TransportOptions): Transporter;
}
```

#### Option 2: Contribute to DefinitelyTyped
**Approach:** Submit PR to make AWS SDK types optional in `@types/nodemailer`

**Pros:**
- Helps entire community
- Official solution
- Proper long-term fix

**Cons:**
- Requires community review/approval
- Weeks to months timeline
- May be rejected if AWS types are considered core

**Effort:** Several hours + waiting for PR review

#### Option 3: Use Type Assertions
**Approach:** Remove `@types/nodemailer` and use `any` or minimal assertions

**Pros:**
- Immediate bloat removal
- No maintenance

**Cons:**
- Loss of type safety
- Harder to catch bugs
- Poor developer experience

**Effort:** 5 minutes

**NOT RECOMMENDED** - Type safety is important for Amy's Echo

#### Option 4: Accept Current State
**Approach:** Do nothing, accept the 11MB overhead

**Pros:**
- Zero effort
- Full type coverage
- No maintenance burden

**Cons:**
- Continued bloat
- Slower CI/CD
- Unnecessary dependencies

## Recommendation

**Implement Option 1: Create Minimal Type Definitions**

### Rationale

1. **Amy First Alignment**: 
   - Faster CI/CD means faster deployments for bug fixes that could affect Amy
   - Reduced complexity in node_modules reduces potential for weird dependency issues
   - Type safety still maintained (unlike Option 3)

2. **Practical Benefits**:
   - 11MB reduction in development environment
   - Faster `npm ci` in GitHub Actions (estimated 5-10 seconds saved per run)
   - Cleaner dependency tree
   - No runtime impact (types are dev-only)

3. **Low Risk**:
   - Our nodemailer usage is very simple (2 functions, basic options)
   - Minimal type surface area to maintain
   - Easy to revert if it causes issues

4. **Maintainability**:
   - Our usage is stable (email sending is mature functionality)
   - Type changes in nodemailer are rare
   - 5 minutes per upgrade is acceptable overhead

### Implementation Plan

1. Create `server/src/types/nodemailer.d.ts` with minimal types for our usage
2. Remove `@types/nodemailer` from `devDependencies`
3. Run TypeScript compiler to verify no errors
4. Run existing tests to ensure no breakage
5. Document the custom types in code comments
6. Update AGENTS.md to explain why we have custom types

### When to Reconsider

- If we need to add AWS SES transport (then restore @types/nodemailer)
- If nodemailer makes breaking API changes and custom types become burden
- If DefinitelyTyped accepts AWS-optional types (then switch back to official)

## Decision Required

This is marked as a TODO because it requires:
1. **Team consensus** on accepting ~30 minutes of initial work for 11MB savings
2. **Product decision** on whether we'll ever need AWS SES (if yes, keep current types)
3. **Risk assessment** on maintaining custom types vs. accepting bloat

## Related Documentation

- Nodemailer usage: `server/src/services/emailService.ts`
- TypeScript config: `server/tsconfig.json`
- Package dependencies: `server/package.json`

---

**Status:** Documented and analyzed. Awaiting decision from project maintainers.

**Next Actions:**
1. Discuss in team meeting whether to proceed with Option 1
2. If approved, create implementation PR
3. If rejected, mark TODO as "Accepted Tradeoff" and close
