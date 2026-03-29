---
name: express-zod-api-hardening
description: Build and harden Amy's Echo backend APIs using Express 5 and Zod contracts. Use when adding or modifying server routes, middleware, request validation, auth/profile checks, error handling, and response-shape guarantees.
---

# Express Zod API Hardening

Apply this skill for server route work to keep API behavior safe and predictable.

## 1) Design explicit request/response contracts

- Define request schemas with Zod at route boundaries.
- Use strict parsing for params/body/query before business logic.
- Return normalized error payloads for validation failures.

## 2) Implement Express 5-safe route flow

1. Parse and validate request input immediately.
2. Execute auth/session checks.
3. Execute profile-scope checks when relevant.
4. Call domain service.
5. Return typed/sanitized response.
6. Forward unexpected failures to centralized error handling.

## 3) Prevent common reliability regressions

- Never allow partial success states after validation/auth failure.
- Keep rate limiting and input size limits in place for mutation endpoints.
- Preserve current behavior for `401` and profile-missing paths.

## 4) Verify route changes

- Run targeted route tests (`npm run test:ts --prefix server -- <route-test>`).
- Run server type-check and full tests when contract risk is broad.
- Re-test neighboring routes that share middleware/utilities.

## References

- Express and Zod primary docs: `references/official-express-zod-docs.md`
- Route hardening checklist: `references/route-hardening-checklist.md`
