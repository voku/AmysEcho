## Linting Report - September 5, 2025

This report summarizes the current linting status of the `app` directory after setting up a modern ESLint v9 configuration.

**ESLint Setup:**
*   **Version:** ESLint 9.34.0
*   **Configuration File:** `app/eslint.config.js` (using new flat config format)
*   **Parser:** `@typescript-eslint/parser`
*   **Plugins:** `@typescript-eslint`, `react`, `react-hooks`, `jest`
*   **Ignored Paths:** `android/`, `ios/`, `node_modules/`, `build/`, `dist/`, `.expo/`, and specific generated files like `EXDevMenuApp.android.js`, `gestureDetector.js`, `index.js`.

**Summary:**

The linter now runs successfully without parsing errors. All critical `react-hooks/exhaustive-deps` warnings have been addressed. The remaining issues are all `no-unused-vars` warnings, indicating variables or imports that are defined but never used. These are generally safe to remove and contribute to code cleanliness and reduced bundle size.

**Remaining Warnings (`@typescript-eslint/no-unused-vars`):**

### `app/src/screens/RecognitionScreen.tsx`
*   `101:9` warning: `_lastErrorFeedbackAtRef` is assigned a value but never used

### `app/src/screens/ScheduleScreen.tsx`
*   `6:10` warning: `loadProfile` is defined but never used
*   `14:32` warning: `activity` is defined but never used

### `app/src/screens/TeachScreen.tsx`
*   `2:10` warning: `View` is defined but never used
*   `8:11` warning: `largeText` is assigned a value but never used

### `app/src/screens/TrainingScreen.tsx`
*   `50:9` warning: `isFocused` is assigned a value but never used
*   `51:10` warning: `appState` is assigned a value but never used

### `app/src/services/gestureSuggester.ts`
*   `111:5` warning: `handedness` is defined but never used
*   `153:11` warning: `palmBase` is assigned a value but never used

### `app/src/services/trainingSync.ts`
*   `94:16` warning: `err` is defined but never used

### `app/src/webview/installMlp.ts`
*   `19:11` warning: `_minor` is assigned a value but never used

### `app/test/MediaPipeGestureDetector.test.tsx`
*   `1:8` warning: `React` is defined but never used

### `app/test/components/Celebration.test.tsx`
*   `9:61` warning: `_` is defined but never used

### `app/test/logger.test.ts`
*   `7:34` warning: `args` is defined but never used

### `app/test/modelUpdate.test.ts`
*   `1:31` warning: `validateModelUpdate` is defined but never used
*   `4:10` warning: `CUSTOM_GESTURE_MODEL_PATH` is defined but never used

### `app/test/screens/RecognitionScreen.test.tsx`
*   `14:61` warning: `_` is defined but never used

### `app/test/symbolButton.test.tsx`
*   `17:7` warning: `childHaptic` is assigned a value but never used

### `app/webview/gestureDetector.ts`
*   `9:3` warning: `MediaPipeGestureResult` is defined but never used
*   `10:3` warning: `MLPPrediction` is defined but never used
*   `11:3` warning: `GestureResult` is defined but never used
*   `12:3` warning: `WebViewMessagePayload` is defined but never used
*   `14:3` warning: `FilesetResolver` is defined but never used
*   `15:3` warning: `VisionTasks` is defined but never used
*   `17:3` warning: `HandLandmark` is defined but never used
*   `18:3` warning: `GestureCategory` is defined but never used
*   `19:3` warning: `HandednessCategory` is defined but never used
*   `779:17` warning: `error` is defined but never used
*   `1313:12` warning: `e` is defined but never used
*   `1637:11` warning: `shouldRetry` is assigned a value but never used

**Recommendation:**

These unused variables and imports should be removed to improve code readability and maintainability. While I cannot directly modify the code, these can be safely removed by the development team.