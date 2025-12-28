# Error Handling in Amy's Echo

Amy's Echo aims to surface user-friendly messages while capturing technical details for developers. This document describes the standard pattern for dealing with errors in the webapp.

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

Components such as `SignLanguageRecorder` read error state directly from hooks like `useSignLanguageDetector`. When the hook reports a problem, log it and update local state so the UI can react:

```tsx
const { error } = useSignLanguageDetector(videoRef, overlayRef);

useEffect(() => {
  if (error) {
    logger.warn('Gesture detector error:', error);
    setProcessingError(error);
  }
}, [error]);
```

## 4. Display a friendly message

Use the shared `ErrorMessage` component to surface problems to the user. It respects accessibility settings and can be reused on any screen.

```tsx
import ErrorMessage from '../components/ErrorMessage';

<ErrorMessage message={processingError} />
```

## 5. Reset when recovered

Clear the error state when the operation succeeds so the UI returns to normal. In gesture recognition, `onGestureResult` resets the `processingError` state when a frame is processed successfully.

Following this pattern keeps technical information in logs while presenting clear, concise messages to Amy and caregivers.
