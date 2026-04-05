# Error Handling in Amy's Echo

Amy's Echo aims to surface user-friendly messages while capturing technical details for developers. This document describes the standard pattern for handling errors in the webapp.

## 1. Global Error Boundary

Routes are wrapped in `ChildErrorBoundary`, which catches unexpected crashes and shows a gentle retry prompt. Errors are logged so developers can investigate without exposing technical details to children.

## 2. Log with the shared logger

Use the shared `logger` utility instead of `console.*` to record errors:

```ts
import { logger } from '../services/logger';

try {
  // ...
} catch (err) {
  logger.error('Failed to perform action:', err);
}
```

The logger automatically filters output by build type and keeps the console consistent.

## 3. Read error state from hooks

Components such as `SignLanguageRecorder` read error state directly from hooks like `useSignLanguageDetector` and render it inline:

```tsx
const { error } = useSignLanguageDetector(videoRef, overlayRef);

{error && <div className="gesture-screen__meta-error">{error}</div>}
```

If you want to log errors in a component, you can optionally add a `useEffect` logger. (Note: `SignLanguageRecorder` does not use this pattern.)

```tsx
const { error } = useSignLanguageDetector(videoRef, overlayRef);

useEffect(() => {
  if (error) {
    logger.warn('Gesture detector error:', error);
  }
}, [error]);
```

## 4. Display a friendly message

Render the hook error directly in the UI. The `SignLanguageRecorder` screen uses the gesture error string in the inline error block:

```tsx
{error && <div className="gesture-screen__meta-error">{error}</div>}
```

## 5. Reset when recovered

The hook clears its own error state when the pipeline recovers, so the UI automatically returns to normal when `error` becomes empty.

Following this pattern keeps technical information in logs while presenting clear, concise messages to Amy and caregivers.
