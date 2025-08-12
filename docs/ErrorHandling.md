# Error Handling in Amy's Echo

Amy's Echo aims to surface user-friendly messages while capturing technical details for developers. This document describes the standard pattern for dealing with errors in the mobile app.

## 1. Log with the shared logger

Use the `logger` utility instead of `console.*` to record errors:

```ts
import { logger } from '../utils/logger';

try {
  // ...
} catch (err) {
  logger.error('Failed to perform action:', err);
}
```

The logger automatically filters output by build type and keeps the console consistent.

## 2. Pass errors through callbacks

Hooks such as `useGestureClassifier` accept an optional `onError` callback. The hook invokes the callback whenever a processing failure occurs, allowing screens to react:

```ts
const handleError = (msg: string) => {
  logger.warn('Frame processor error:', msg);
  setProcessingError(msg);
};

const frameProcessor = useGestureClassifier(onGestureResult, isProcessing, 0.7, handleError);
```

## 3. Display a friendly message

Use the shared `ErrorMessage` component to surface problems to the user. It respects accessibility settings and can be reused on any screen.

```tsx
import ErrorMessage from '../components/ErrorMessage';

<ErrorMessage message={processingError} />
```

## 4. Reset when recovered

Clear the error state when the operation succeeds so the UI returns to normal. In gesture recognition, `onGestureResult` resets the `processingError` state when a frame is processed successfully.

Following this pattern keeps technical information in logs while presenting clear, concise messages to Amy and caregivers.
