# Blind Spot Analysis & Project Alignment Report
**Date:** March 8, 2026
**Target:** Alignment with `spec/AmysEcho.md` ("Build for One")

## Executive Summary
The project is firmly on the "right way" regarding feature scope, user experience design, and the "build for one" philosophy. The recent implementation of **HIPs 1-4** (Onboarding, Training, Correction, Maintenance) and the "sparse data" reliability fix demonstrates a strong commitment to the specific needs of the target user (Amy).

However, a **Critical Blind Spot** has been identified in the infrastructure layer: **Offline Model Persistence**. While the *upload* queue uses robust offline storage (OPFS/IndexedDB), the *model itself* is currently fetched via standard HTTP without persistent caching. This violates the core "Offline Fallback" mandate of the specification.

---

## 1. Alignment with Core Mandates

### ✅ Validated Alignment
*   **HIP 1 (Onboarding):** Implemented in `webapp/src/components/Onboarding.tsx`.
*   **HIP 2 (Training Mode):** Implemented via `TrainingRecorder` and `TrainingUpload`. The recent "sparse data" fix (NULL class + adaptive augmentation) directly supports the requirement to make the system usable with just ~5 examples.
*   **HIP 3 (Correction):** Implemented via `CorrectionPanel` and `correctionService`. The suppression of "NULL" predictions ensures the system asks for help instead of guessing wrongly.
*   **HIP 4 (Proactive Maintenance):** Supported by `healthScore.ts` and `CommunicationInsights` (though specific UI banner could be verified).
*   **"Build for One":** No evidence of scope creep (e.g., social features, gamification, multi-tenant complexity). The extensive Metacom integration is justified by the user's specific communication needs.

### ⚠️ Scope Watch
*   **Metacom Integration:** The `services/metacom*` layer is dense. While valuable, it adds significant complexity. Ensure it doesn't decouple from the primary "Gesture -> Voice" loop.

---

## 2. The Critical Blind Spot: Offline Model Caching

**Specification Mandate (Chapter 3.1):**
> "Uses the latest downloaded MLP weights cached on-device to ensure the app remains functional, even without internet."

**Current Reality (`webapp/src/gesture/modelClient.ts`):**
*   The system uses `fetchMlpModelWithFallback`, which performs a standard network request (`fetch`).
*   If the device is offline or the request fails, the model is **not loaded**.
*   `getCachedMlpModel` is currently a stub:
    ```typescript
    /**
     * Get cached MLP model (stub for integration tests).
     * In production, this would return cached model data.
     */
    export async function getCachedMlpModel(profileId?: string): Promise<string | null> {
      // For integration tests, just fetch fresh
      return fetchMlpModel(profileId);
    }
    ```

**Impact:**
If the user opens the app without an internet connection, **gesture recognition will fail completely**. This breaks the "Resilience Over Perfection" promise.

---

## 3. Recommendations

### Immediate Actions (P0)
1.  **Implement Persistent Model Caching:**
    *   Create a `ModelStorageService` mirroring the robust logic in `trainingQueue.ts` (using OPFS with IndexedDB fallback).
    *   Store the `.npz` (base64) model string keyed by `profileId` and `version`.
2.  **Update `modelClient.ts`:**
    *   Modify `fetchMlpModelWithFallback` to:
        1.  Try to fetch from network.
        2.  If successful, save to storage.
        3.  If network fails, read from storage.

### Strategic Adjustments
1.  **Verify Maintenance Banner:** Confirm that `HIP 4` has a visible UI component (`ProactiveBanner.tsx`) triggered by health scores, as `StatusCapsule` might be too subtle.

---

## Conclusion
We have not introduced unwanted features. We have, however, missed a foundational infrastructure requirement. The path forward is to apply the same robust engineering used for the *Upload Queue* to the *Model Downloader*.
