# Route Hardening Checklist

Before merge of route changes:

1. Validate `req.params`, `req.query`, and `req.body` with Zod schemas.
2. Verify invalid payload returns deterministic 4xx response.
3. Verify expired/invalid token returns `401` without local false success.
4. Verify profile-required endpoints reject missing `profileId` context.
5. Verify rate limiter still wraps sensitive endpoints.
6. Verify response body avoids leaking stack traces/internal IDs.
7. Re-run tests for routes that share validation helpers.
