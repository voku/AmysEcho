# Identity Regression Checklist

When auth/profile/upload/training behavior changes, verify:

1. Missing `profileId` blocks upload/training requests.
2. `401` during profile action does not produce local false-success UI.
3. Profile switch updates request scope and clears stale pending state when needed.
4. Account-level actions do not mutate wrong profile state.
5. At least one user-visible assertion is present for failure handling.
