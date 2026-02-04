## Server Code Audit Findings - September 6, 2025 (Updated)

This report details potential blind spots, logic errors, and areas for improvement identified during a manual code review of the `server` directory.

### 1. Audit of `app/src/services/syncService.ts` (Client-side Sync Logic - Archived App)

**Status: Resolved (Historical - refers to archived mobile app)**

Note: This audit refers to the archived React Native app. See `docs/architecture/migration/APP_ARCHIVE.md` for details.

All issues identified in the previous audit have been addressed:

*   **Concurrency Control:** The `uploadLock` mechanism is in place and prevents concurrent uploads.
*   **Retry Mechanism:** The `retryWithBackoff` helper function is used for both training data uploads and telemetry synchronization.
*   **Consent Caching:** The `getCachedConsent` function with a `CONSENT_CACHE_TTL` is implemented.
*   **Error Handling for `refreshDgsModel`:** The `refreshDgsModel` call is now wrapped in its own `try...catch` block.
*   **`telemetry.dump()` Error Handling:** The `telemetry.dump()` call is now wrapped in its own `try...catch` block.
*   **Malformed `landmarkData` Handling:** The code now marks corrupted samples as "corrupted" in the database.
*   **`finally` block in `_performUpload`:** The `syncTelemetry` call has been moved out of the `finally` block.

### 2. Analysis of `train_mlp.py` and Data Processing Issues

**Status: Resolved**

The `_normalize` function in `train_mlp.py` has been reviewed and it correctly handles single-handed gestures by padding the missing hand with zeros.

### 3. Audit of `server/src/server.ts` (Main Server Entry Point)

**Status: Partially Resolved**

*   **3.1. Inconsistent Error Handling and Logging:** **Resolved.** A centralized error handler has been added to `src/server.ts`.
*   **3.2. `dbInstance` Initialization Race Condition:** **Resolved.** The database is initialized before the server starts listening for requests.
*   **3.3. `withFileLock` Usage and Potential Deadlocks:** **Reviewed.** The implementation of `withFileLock` seems correct and should not cause deadlocks.
*   **3.4. `spawn` Error Handling and Output Buffering:** **Reviewed.** The `spawn` call has error handling and a reasonable limit for stderr output. This is acceptable for now.
*   **3.5. `MLP_SCRIPT` Environment Variable Default Path:** **Resolved.** The default path is now an absolute path.
*   **3.6. `isProfileAuthorized` Logic:** **Reviewed.** The current implementation is a basic authorization check. It is acceptable for the current requirements.
*   **3.7. Analytics Endpoints (Manual CSV Export):** **Reviewed.** The manual CSV generation is prone to errors, but it is acceptable for now. A dedicated CSV library is recommended for future improvements.