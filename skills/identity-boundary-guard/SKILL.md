---
name: identity-boundary-guard
description: Protect Amy's Echo account-versus-profile identity boundaries. Use when working on auth, settings, profile switching, uploads, training sync, or API flows where session/token and profileId can diverge.
---

# Identity Boundary Guard

Prevent auth/profile mixups that cause silent data corruption or false success states.

## 1) Classify each touched path

For every touched module, classify it as:

- **Account identity**: auth, session, token lifecycle.
- **Profile identity**: child profile context (`profileId`), personalization, training scope.

If a flow needs both, validate both explicitly.

## 2) Apply boundary rules

- Never treat a valid token as substitute for missing profile context.
- Never treat an active profile as substitute for valid auth session.
- Block profile-scoped operations when `profileId` is missing/stale.
- Avoid local success states when server state failed (`401`, `4xx`, network failure).

## 3) Reuse established integration points

Use the referenced architecture map before adding new auth/profile logic.

## 4) Add/verify non-happy-path tests

Cover at least these cases when relevant:

1. Valid auth + missing profile.
2. Profile switch during active session.
3. Session expiry during profile-scoped operation.
4. No false UI success after server failure.

## References

- Identity architecture map: `references/identity-map.md`
- Regression checklist: `references/identity-test-checklist.md`
